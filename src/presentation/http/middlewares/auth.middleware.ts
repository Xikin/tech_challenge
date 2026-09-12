import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError, ForbiddenError } from '../../../shared/errors';
import { ROLES_INTERNOS, type RoleToken } from '../../../domain/enums/role.enum';
import { EMISSOR_CLIENTE, EMISSOR_INTERNO } from '../../../domain/auth/emissores';

/** Claims que esta API espera encontrar em qualquer token que valide. */
export interface UsuarioAutenticado {
  sub: string;
  role: RoleToken;
  iss?: string;
  /** Presentes apenas em tokens emitidos pela Lambda de autenticação por CPF. */
  cpf?: string;
  nome?: string;
  email?: string;
}

type Emissor = 'interno' | 'cliente';

function usuarioDe(req: FastifyRequest): UsuarioAutenticado {
  return req.user as unknown as UsuarioAutenticado;
}

/**
 * Verifica o token contra o segredo de um emissor e confere se `iss` e `role`
 * são compatíveis com ele.
 *
 * Devolve `false` quando a assinatura não é desse emissor (ou o token expirou,
 * ou está malformado) — o chamador tenta o outro emissor. Lança quando a
 * assinatura é válida mas os claims não batem: isso não é token vencido nem
 * lixo, é tentativa de forjar papel com um segredo obtido indevidamente.
 */
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

/**
 * Autenticação com amarração entre emissor e papel (ADR-0011).
 *
 *   oficina-api          assinado com JWT_SECRET          -> só ADMIN e FUNCIONARIO
 *   oficina-auth-lambda  assinado com JWT_CLIENTE_SECRET  -> só CLIENTE
 *
 * Com isso, vazar o segredo da Lambda permite no máximo forjar um CLIENTE —
 * nunca um ADMIN. Antes havia um único segredo, e qualquer vazamento dele na
 * Lambda, no state do Terraform ou nos secrets do GitHub dava acesso
 * administrativo.
 *
 * O `iss` é conferido aqui, em código, e não com `allowedIss` do fast-jwt: a
 * versão em uso tem uma CVE justamente na validação desse claim.
 */
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

/**
 * Exige pessoal interno da oficina (ADMIN ou FUNCIONARIO).
 *
 * Sem este guard, um JWT com `role: CLIENTE`, emitido legitimamente pela Lambda,
 * daria acesso a TODAS as rotas autenticadas: listar todos os clientes, listar
 * todas as ordens de serviço, alterar OS de terceiros (ver ADR-0008).
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
