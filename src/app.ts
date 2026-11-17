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
import type Redis from 'ioredis';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { AppError, TooManyRequestsError } from './shared/errors';
import { mascararDocumentos } from './shared/utils/mascarar-documentos';
import { EMISSOR_INTERNO } from './domain/auth/emissores';
import { cacheDesligado, type ICache } from './domain/services/cache.service.interface';
import { ConflitoDeVersaoError } from './domain/repositories/saga.repository.interface';
import {
  rastreamentoDesligado,
  type IRastreamento,
} from './domain/services/rastreamento.interface';
import { authRoutes } from './presentation/http/routes/auth.routes';
import { clientesRoutes } from './presentation/http/routes/clientes.routes';
import { veiculosRoutes } from './presentation/http/routes/veiculos.routes';
import { ordensRoutes } from './presentation/http/routes/ordens.routes';
import { RedisCache } from './infrastructure/cache/redis-cache';
import { integracaoRoutes } from './presentation/http/routes/integracao.routes';

export interface Dependencias {
  cache: ICache;
  rastreamento: IRastreamento;
  redis: Redis | null;
  mensageria: { readonly conectado: boolean } | null;
}

export async function buildApp(deps: Partial<Dependencias> = {}): Promise<FastifyInstance> {
  const rastreamento = deps.rastreamento ?? rastreamentoDesligado;
  const mensageria = deps.mensageria ?? null;

  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: env.LOG_LEVEL,
            base: {
              service: 'oficina-os',
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

  const cache = deps.cache ?? (deps.redis ? new RedisCache(deps.redis, app.log) : cacheDesligado);

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
    ...(deps.redis && { redis: deps.redis, nameSpace: 'oficina-os:limite:', skipOnError: true }),
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
          title: 'Oficina Mecânica — OS Service',
          version: '2.0.0',
          description:
            'Clientes, veículos, ordens de serviço e orquestração da saga de atendimento.',
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
          { name: 'Ordens de Serviço' },
          { name: 'Integração' },
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
    if (error instanceof ConflitoDeVersaoError) {
      req.log.warn(
        { evento: 'erro_negocio', codigo: 'CONFLICT', rota: req.routeOptions?.url },
        'saga alterada por outro processo durante a requisição',
      );
      return reply.status(409).send({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'A OS foi alterada ao mesmo tempo por outro processo; tente de novo',
      });
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

    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      req.log.warn(
        { evento: 'requisicao_invalida', codigo: error.code, rota: req.routeOptions?.url },
        error.message,
      );
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        code: error.code ?? 'BAD_REQUEST',
        message: error.message,
      });
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
          dependencias: {
            database: 'ok',
            mensageria: mensageria ? (mensageria.conectado ? 'ok' : 'reconectando') : 'desligada',
          },
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
  app.register(ordensRoutes, { prefix: '/ordens', cache, rastreamento });
  app.register(integracaoRoutes, { prefix: '/integracao' });

  return app;
}
