import '@fastify/jwt';
import type { FastifyJwtVerifyOptions, VerifyPayloadType } from '@fastify/jwt';

declare module '@fastify/jwt' {
  interface JWT {
    cliente: JWT;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    clienteJwtVerify<Decoded extends VerifyPayloadType>(
      options?: FastifyJwtVerifyOptions,
    ): Promise<Decoded>;
  }
}
