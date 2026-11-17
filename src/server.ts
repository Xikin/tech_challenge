import Redis from 'ioredis';
import { buildApp } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { RedisCache } from './infrastructure/cache/redis-cache';
import { RabbitMQ } from './infrastructure/mensageria/rabbitmq';
import { OutboxRelay } from './infrastructure/mensageria/outbox-relay';
import { RastreamentoNewRelic } from './infrastructure/observabilidade/rastreamento-newrelic';
import { PrismaOrdemRepository } from './infrastructure/database/repositories/prisma-ordens.repository';
import { PrismaSagaRepository } from './infrastructure/database/repositories/prisma-saga.repository';
import { NodemailerEmailService } from './infrastructure/services/nodemailer-email.service';
import { NotificadorCliente } from './application/saga/notificador-cliente';
import { ExecutorDeSaga } from './application/saga/executor-saga';
import {
  CONSUMIDOR_SAGA,
  ProcessarEventoSagaUseCase,
} from './application/saga/processar-evento-saga.use-case';
import { lerEnvelope } from './application/saga/contratos';
import { cacheDesligado } from './domain/services/cache.service.interface';
import { SERVICO_OS } from './domain/mensageria/mensagem';

async function start() {
  const rastreamento = new RastreamentoNewRelic();

  const redis = env.REDIS_URL
    ? new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 2000,
      })
    : null;

  let mensageria: RabbitMQ | null = null;
  const app = await buildApp({
    rastreamento,
    redis,
    mensageria: env.RABBITMQ_URL
      ? {
          get conectado() {
            return mensageria?.conectado ?? false;
          },
        }
      : null,
  });
  const logger = app.log;
  const cache = redis ? new RedisCache(redis, logger) : cacheDesligado;

  redis?.on('error', (erro) =>
    logger.warn(
      { evento: 'falha_integracao', integracao: 'redis', erro: erro.message },
      'Redis indisponível',
    ),
  );

  await prisma.$connect();

  let relay: OutboxRelay | null = null;
  if (env.RABBITMQ_URL) {
    mensageria = new RabbitMQ({
      url: env.RABBITMQ_URL,
      exchange: env.RABBITMQ_EXCHANGE,
      servico: SERVICO_OS,
      maxTentativas: env.MENSAGERIA_MAX_TENTATIVAS,
      atrasoRetentativaMs: env.MENSAGERIA_ATRASO_RETENTATIVA_MS,
      logger,
      rastreamento,
    });
    const sagas = new PrismaSagaRepository();
    const executor = new ExecutorDeSaga(
      sagas,
      new NotificadorCliente(new NodemailerEmailService(), logger),
      cache,
      rastreamento,
      logger,
    );
    const processar = new ProcessarEventoSagaUseCase(
      new PrismaOrdemRepository(),
      sagas,
      executor,
      logger,
    );
    mensageria.registrar({
      fila: CONSUMIDOR_SAGA,
      bindings: ['execucao.evento.#', 'billing.evento.#'],
      prefetch: 1,
      tratar: (bruto) => processar.execute(lerEnvelope(bruto)),
    });
    await mensageria.conectar();

    relay = new OutboxRelay(mensageria, logger, {
      intervaloMs: env.OUTBOX_INTERVALO_MS,
      lote: 50,
      retencaoHoras: 72,
    });
    relay.iniciar();
  } else {
    logger.warn(
      { evento: 'mensageria_desligada' },
      'RABBITMQ_URL ausente: a saga não avança e o outbox acumula mensagens',
    );
  }

  await app.listen({ port: env.PORT, host: env.HOST });

  logger.info(
    { evento: 'servidor_iniciado', porta: env.PORT, host: env.HOST },
    `servidor ouvindo em http://${env.HOST}:${env.PORT}`,
  );
  if (env.SWAGGER_ENABLED) {
    logger.info({ evento: 'swagger_disponivel' }, `documentação em /docs`);
  }

  let encerrando = false;
  const encerrar = async (sinal: string) => {
    if (encerrando) return;
    encerrando = true;

    logger.info({ evento: 'encerramento_iniciado', sinal }, 'encerrando graciosamente');
    try {
      await app.close();
      await relay?.parar();
      await mensageria?.encerrar();
      redis?.disconnect();
      await prisma.$disconnect();
      logger.info({ evento: 'encerramento_concluido' }, 'encerrado');
      process.exit(0);
    } catch (erro) {
      logger.error({ evento: 'encerramento_falhou', err: erro }, 'falha ao encerrar');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void encerrar('SIGTERM'));
  process.on('SIGINT', () => void encerrar('SIGINT'));
}

start().catch((err) => {
  console.error(
    JSON.stringify({
      level: 'fatal',
      service: 'oficina-os',
      evento: 'falha_ao_iniciar',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      timestamp: new Date().toISOString(),
    }),
  );
  process.exit(1);
});
