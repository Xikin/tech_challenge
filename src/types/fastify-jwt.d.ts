import '@fastify/jwt';
import type { FastifyJwtVerifyOptions, VerifyPayloadType } from '@fastify/jwt';

// Segundo registro do @fastify/jwt, com o segredo do emissor de clientes
// (namespace `cliente`, ver src/app.ts). O plugin cria os decorators em runtime;
// estas declarações apenas os tornam visíveis para o TypeScript.

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
