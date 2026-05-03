import { FastifyReply, FastifyRequest } from "fastify";
import { ForbiddenError, UnauthorizedError } from "../errors";

export async function autenticar(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    throw new UnauthorizedError("Token inválido ou expirado");
  }
}

export function exigirRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await autenticar(request, reply);
    const user = request.user as { role: string };
    if (!roles.includes(user.role)) throw new ForbiddenError();
  };
}
