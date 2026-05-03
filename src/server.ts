import { buildApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/prisma";

async function start() {
  const app = await buildApp();
  await prisma.$connect();
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`🚀 Servidor rodando em http://${env.HOST}:${env.PORT}`);
  app.log.info(`📚 Documentação: http://localhost:${env.PORT}/docs`);
}

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
