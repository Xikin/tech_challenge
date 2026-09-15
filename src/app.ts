import { randomUUID } from 'node:crypto';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { AppError, TooManyRequestsError } from './shared/errors';
import { mascararDocumentos } from './shared/utils/mascarar-documentos';
import { EMISSOR_INTERNO } from './domain/auth/emissores';
import { authRoutes } from './presentation/http/routes/auth.routes';
import { clientesRoutes } from './presentation/http/routes/clientes.routes';
import { veiculosRoutes } from './presentation/http/routes/veiculos.routes';
import { servicosRoutes } from './presentation/http/routes/servicos.routes';
import { pecasRoutes } from './presentation/http/routes/pecas.routes';
import { ordensRoutes } from './presentation/http/routes/ordens.routes';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: env.LOG_LEVEL,
            base: {
              service: 'oficina-api',
              env: env.NODE_ENV,
              version: process.env.APP_VERSION ?? 'dev',
            },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.senha',
                'req.body.password',
                'res.headers["set-cookie"]',
              ],
              censor: '[REDACTED]',
            },
            serializers: {
              req(request: {
                method?: string;
                url?: string;
                hostname?: string;
                ip?: string;
                socket?: { remotePort?: number };
              }) {
                return {
                  method: request.method,
                  url: request.url ? mascararDocumentos(request.url) : request.url,
                  hostname: request.hostname,
                  remoteAddress: request.ip,
                  remotePort: request.socket?.remotePort,
                };
              },
            },
          },
    genReqId(req) {
      const header = req.headers['x-request-id'];
      if (typeof header === 'string' && header.length > 0 && header.length <= 200) return header;
      if (Array.isArray(header) && header[0]) return header[0];
      return randomUUID();
    },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('x-request-id', req.id);
    return payload;
  });

  const allowedOrigins = env.ALLOWED_ORIGINS.split(',').filter(Boolean);
  await app.register(fastifyCors, {
    origin: allowedOrigins.length > 0 ? allowedOrigins : env.NODE_ENV !== 'production',
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  await app.register(fastifyJwt, { secret: env.JWT_SECRET, sign: { iss: EMISSOR_INTERNO } });
  await app.register(fastifyJwt, { secret: env.JWT_CLIENTE_SECRET, namespace: 'cliente' });

  await app.register(fastifyRateLimit, {
    global: false,
    errorResponseBuilder: (_req, contexto) =>
      new TooManyRequestsError(
        `Muitas tentativas. Tente novamente em ${Math.max(1, Math.ceil(contexto.ttl / 60_000))} minuto(s).`,
      ),
  });

  if (env.SWAGGER_ENABLED) {
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

  app.setErrorHandler((error, req, reply) => {
    if (error.validation) {
      req.log.warn(
        { evento: 'erro_validacao', codigo: 'VALIDATION_ERROR', rota: req.routeOptions?.url },
        'requisição rejeitada na validação de schema',
      );
      return reply.status(422).send({
        statusCode: 422,
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        errors: error.validation,
      });
    }
    if (error instanceof ZodError) {
      req.log.warn(
        { evento: 'erro_validacao', codigo: 'VALIDATION_ERROR', rota: req.routeOptions?.url },
        'requisição rejeitada na validação Zod',
      );
      return reply.status(422).send({
        statusCode: 422,
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        errors: error.flatten().fieldErrors,
      });
    }
    if (error instanceof AppError) {
      req.log.warn(
        {
          evento: 'erro_negocio',
          codigo: error.code,
          statusCode: error.statusCode,
          rota: req.routeOptions?.url,
          mensagem: error.message,
        },
        'regra de negócio rejeitou a requisição',
      );
      return reply
        .status(error.statusCode)
        .send({ statusCode: error.statusCode, code: error.code, message: error.message });
    }
    if (error.code === 'P2002') {
      req.log.warn(
        { evento: 'erro_negocio', codigo: 'CONFLICT', rota: req.routeOptions?.url },
        'violação de unicidade no banco',
      );
      return reply
        .status(409)
        .send({ statusCode: 409, code: 'CONFLICT', message: 'Registro duplicado' });
    }

    req.log.error(
      { evento: 'erro_interno', rota: req.routeOptions?.url, err: error },
      'erro não tratado ao processar requisição',
    );
    return reply
      .status(500)
      .send({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' });
  });

  app.get(
    '/health',
    { schema: { tags: ['Saúde'], summary: 'Liveness — o processo está de pé' } },
    async (_req, rep) => rep.send({ status: 'ok', timestamp: new Date().toISOString() }),
  );

  app.get(
    '/health/ready',
    { schema: { tags: ['Saúde'], summary: 'Readiness — dependências acessíveis' } },
    async (req, rep) => {
      const inicio = Date.now();
      try {
        await prisma.$queryRaw`SELECT 1`;
        return rep.send({
          status: 'ok',
          dependencias: { database: 'ok' },
          latenciaMs: Date.now() - inicio,
          timestamp: new Date().toISOString(),
        });
      } catch (erro) {
        req.log.error(
          { evento: 'readiness_falhou', dependencia: 'database', err: erro },
          'banco de dados inacessível',
        );
        return rep.status(503).send({
          status: 'degradado',
          dependencias: { database: 'indisponivel' },
          latenciaMs: Date.now() - inicio,
          timestamp: new Date().toISOString(),
        });
      }
    },
  );

  app.register(authRoutes, { prefix: '/auth' });
  app.register(clientesRoutes, { prefix: '/clientes' });
  app.register(veiculosRoutes, { prefix: '/veiculos' });
  app.register(servicosRoutes, { prefix: '/servicos' });
  app.register(pecasRoutes, { prefix: '/pecas' });
  app.register(ordensRoutes, { prefix: '/ordens' });

  return app;
}
