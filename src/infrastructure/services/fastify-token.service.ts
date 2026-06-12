import type { FastifyInstance } from "fastify";
import type { ITokenService, TokenPayload } from "../../domain/services/token.service.interface";

export class FastifyTokenService implements ITokenService {
  constructor(private readonly fastify: FastifyInstance) {}

  sign(payload: TokenPayload, expiresIn: string): string {
    return this.fastify.jwt.sign(payload, { expiresIn });
  }
}
