import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError, ForbiddenError } from '../../../shared/errors';

export async function autenticar(req: FastifyRequest, _rep: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    throw new UnauthorizedError('Token inválido ou expirado');
  }
}

export function exigirRole(...roles: string[]) {
  return async (req: FastifyRequest, _rep: FastifyReply) => {
    await autenticar(req, _rep);
    const user = req.user as { role: string };
    if (!roles.includes(user.role)) throw new ForbiddenError('Acesso negado');
  };
}
