import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError, ForbiddenError } from '../../../shared/errors';
import { ROLES_INTERNOS, type RoleToken } from '../../../domain/enums/role.enum';

/** Claims que esta API espera encontrar em qualquer token que valide. */
export interface UsuarioAutenticado {
  sub: string;
  role: RoleToken;
  /** Presente apenas em tokens emitidos pela Lambda de autenticação por CPF. */
  cpf?: string;
  nome?: string;
  email?: string;
}

function usuarioDe(req: FastifyRequest): UsuarioAutenticado {
  return req.user as unknown as UsuarioAutenticado;
}

export async function autenticar(req: FastifyRequest, _rep: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    throw new UnauthorizedError('Token inválido ou expirado');
  }
}

export function exigirRole(...roles: RoleToken[]) {
  return async (req: FastifyRequest, _rep: FastifyReply) => {
    await autenticar(req, _rep);
    const user = usuarioDe(req);
    if (!roles.includes(user.role)) throw new ForbiddenError('Acesso negado');
  };
}

/**
 * Exige pessoal interno da oficina (ADMIN ou FUNCIONARIO).
 *
 * Este guard é a peça central da Fase 3. Antes dele, `autenticar` apenas
 * verificava a assinatura do token — de modo que um JWT com `role: CLIENTE`,
 * emitido legitimamente pela Lambda, daria acesso a TODAS as rotas
 * autenticadas: listar todos os clientes, listar todas as ordens de serviço,
 * alterar OS de terceiros. A autenticação por CPF viraria escalonamento de
 * privilégio (ver ADR-0008).
 */
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

/**
 * Permite pessoal interno OU o próprio cliente dono do recurso.
 *
 * `extrairDonoId` recebe a requisição já autenticada e devolve o id do cliente
 * a quem o recurso pertence — normalmente consultando o repositório. Devolver
 * `null` significa "recurso não encontrado", e o guard deixa a rota responder
 * 404 no fluxo normal em vez de vazar existência por meio de um 403.
 */
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
