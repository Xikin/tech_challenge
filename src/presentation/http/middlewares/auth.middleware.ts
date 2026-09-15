import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError, ForbiddenError } from '../../../shared/errors';
import { ROLES_INTERNOS, type RoleToken } from '../../../domain/enums/role.enum';
import { EMISSOR_CLIENTE, EMISSOR_INTERNO } from '../../../domain/auth/emissores';

export interface UsuarioAutenticado {
  sub: string;
  role: RoleToken;
  iss?: string;
  cpf?: string;
  nome?: string;
  email?: string;
}

type Emissor = 'interno' | 'cliente';

function usuarioDe(req: FastifyRequest): UsuarioAutenticado {
  return req.user as unknown as UsuarioAutenticado;
}

async function verificarComo(req: FastifyRequest, emissor: Emissor): Promise<boolean> {
  try {
    if (emissor === 'interno') await req.jwtVerify();
    else await req.clienteJwtVerify();
  } catch {
    return false;
  }

  const user = usuarioDe(req);
  const compativel =
    emissor === 'interno'
      ? user.iss === EMISSOR_INTERNO && ROLES_INTERNOS.includes(user.role)
      : user.iss === EMISSOR_CLIENTE && user.role === 'CLIENTE';

  if (!compativel) {
    req.log.warn(
      { evento: 'token_emissor_invalido', emissor, iss: user.iss, role: user.role, sub: user.sub },
      'token com assinatura válida, mas emissor ou papel incompatível',
    );
    throw new UnauthorizedError('Token inválido ou expirado');
  }
  return true;
}

export async function autenticar(req: FastifyRequest, _rep: FastifyReply) {
  if (await verificarComo(req, 'interno')) return;
  if (await verificarComo(req, 'cliente')) return;
  throw new UnauthorizedError('Token inválido ou expirado');
}

export function exigirRole(...roles: RoleToken[]) {
  return async (req: FastifyRequest, _rep: FastifyReply) => {
    await autenticar(req, _rep);
    const user = usuarioDe(req);
    if (!roles.includes(user.role)) throw new ForbiddenError('Acesso negado');
  };
}

export async function exigirInterno(req: FastifyRequest, rep: FastifyReply) {
  await autenticar(req, rep);
  const user = usuarioDe(req);
  if (!ROLES_INTERNOS.includes(user.role)) {
    req.log.warn(
      { evento: 'acesso_negado', motivo: 'rota_interna', role: user.role, sub: user.sub },
      'cliente tentou acessar rota restrita a pessoal interno',
    );
    throw new ForbiddenError('Rota restrita a usuários da oficina');
  }
}

export function exigirDonoDoRecurso(
  extrairDonoId: (req: FastifyRequest) => Promise<string | null>,
) {
  return async (req: FastifyRequest, rep: FastifyReply) => {
    await autenticar(req, rep);
    const user = usuarioDe(req);

    if (ROLES_INTERNOS.includes(user.role)) return;

    const donoId = await extrairDonoId(req);
    if (donoId === null) return;

    if (donoId !== user.sub) {
      req.log.warn(
        { evento: 'acesso_negado', motivo: 'recurso_de_terceiro', sub: user.sub },
        'cliente tentou acessar recurso que não lhe pertence',
      );
      throw new ForbiddenError('Você só pode acessar os seus próprios registros');
    }
  };
}
