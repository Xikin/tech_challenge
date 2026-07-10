import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCors from '@fastify/cors';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import { env } from './config/env';
import { AppError } from './shared/errors';
import { authRoutes } from './presentation/http/routes/auth.routes';
import { clientesRoutes } from './presentation/http/routes/clientes.routes';
import { veiculosRoutes } from './presentation/http/routes/veiculos.routes';
import { servicosRoutes } from './presentation/http/routes/servicos.routes';
import { pecasRoutes } from './presentation/http/routes/pecas.routes';
import { ordensRoutes } from './presentation/http/routes/ordens.routes';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: env.NODE_ENV !== 'test' });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const allowedOrigins =
    env.NODE_ENV === 'production'
      ? (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean)
      : true;
  await app.register(fastifyCors, { origin: allowedOrigins, credentials: true });
  await app.register(fastifyJwt, { secret: env.JWT_SECRET });

  if (env.NODE_ENV !== 'production') {
    await app.register(fastifySwagger, {
      transform: jsonSchemaTransform,
      openapi: {
        info: {
          title: 'Oficina Mecânica API',
          version: '1.0.0',
          description: 'MVP — Sistema Integrado de Atendimento',
        },
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
        tags: [
          { name: 'Autenticação' },
          { name: 'Clientes' },
          { name: 'Veículos' },
          { name: 'Serviços' },
          { name: 'Peças e Insumos' },
          { name: 'Ordens de Serviço' },
        ],
      },
    });
    await app.register(fastifySwaggerUi, { routePrefix: '/docs' });
  }

  app.setErrorHandler((error, _req, reply) => {
    if (error.validation) {
      return reply.status(422).send({
        statusCode: 422,
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        errors: error.validation,
      });
    }
    if (error instanceof ZodError) {
      return reply.status(422).send({
        statusCode: 422,
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        errors: error.flatten().fieldErrors,
      });
    }
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send({ statusCode: error.statusCode, code: error.code, message: error.message });
    }
    if (error.code === 'P2002') {
      return reply
        .status(409)
        .send({ statusCode: 409, code: 'CONFLICT', message: 'Registro duplicado' });
    }
    app.log.error(error);
    return reply
      .status(500)
      .send({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' });
  });

  app.get('/health', { schema: { tags: ['Saúde'], summary: 'Health check' } }, async (_req, rep) =>
    rep.send({ status: 'ok', timestamp: new Date().toISOString() }),
  );

  app.register(authRoutes, { prefix: '/auth' });
  app.register(clientesRoutes, { prefix: '/clientes' });
  app.register(veiculosRoutes, { prefix: '/veiculos' });
  app.register(servicosRoutes, { prefix: '/servicos' });
  app.register(pecasRoutes, { prefix: '/pecas' });
  app.register(ordensRoutes, { prefix: '/ordens' });

  return app;
}
