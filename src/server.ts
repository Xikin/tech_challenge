import { buildApp } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';

async function start() {
  const app = await buildApp();

  await prisma.$connect();
  await app.listen({ port: env.PORT, host: env.HOST });

  app.log.info(
    { evento: 'servidor_iniciado', porta: env.PORT, host: env.HOST },
    `servidor ouvindo em http://${env.HOST}:${env.PORT}`,
  );
  if (env.SWAGGER_ENABLED) {
    app.log.info({ evento: 'swagger_disponivel' }, `documentação em /docs`);
  }

  // Encerramento gracioso.
  //
  // O Kubernetes manda SIGTERM e só depois (terminationGracePeriodSeconds)
  // manda SIGKILL. Antes, o handler chamava process.exit() imediatamente e as
  // requisições em voo eram cortadas no meio — o que aparecia como erro 502
  // esporádico a cada deploy e contaminaria a métrica de uptime.
  let encerrando = false;
  const encerrar = async (sinal: string) => {
    if (encerrando) return;
    encerrando = true;

    app.log.info({ evento: 'encerramento_iniciado', sinal }, 'encerrando graciosamente');
    try {
      // Para de aceitar novas conexões e aguarda as que estão em andamento.
      await app.close();
      await prisma.$disconnect();
      app.log.info({ evento: 'encerramento_concluido' }, 'encerrado');
      process.exit(0);
    } catch (erro) {
      app.log.error({ evento: 'encerramento_falhou', err: erro }, 'falha ao encerrar');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void encerrar('SIGTERM'));
  process.on('SIGINT', () => void encerrar('SIGINT'));
}

start().catch((err) => {
  // Ainda não existe logger do Fastify aqui; emite JSON à mão para manter o
  // formato de log consistente mesmo numa falha de inicialização.
  console.error(
    JSON.stringify({
      level: 'fatal',
      service: 'oficina-api',
      evento: 'falha_ao_iniciar',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      timestamp: new Date().toISOString(),
    }),
  );
  process.exit(1);
});
