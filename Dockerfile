FROM node:20-alpine AS deps

WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --frozen-lockfile

FROM node:20-alpine AS builder

WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
COPY --from=builder /app/newrelic.cjs ./

# Os arquivos da aplicação ficam com dono root e sem permissão de escrita para
# o usuário que roda o processo. Antes havia `chown -R appuser /app`: o próprio
# processo podia reescrever seu código e dependências — na revisão de
# segurança, um arquivo foi sobrescrito dentro do pod em execução. Com isso e
# com readOnlyRootFilesystem no Kubernetes, uma execução remota de código não
# consegue se tornar persistente.

# /tmp é a única área gravável (tmpfs/emptyDir). HOME e o cache do npm apontam
# para lá para que `npx prisma db seed` funcione com o filesystem só-leitura.
ENV HOME=/tmp \
    NPM_CONFIG_CACHE=/tmp/.npm \
    CHECKPOINT_DISABLE=1

USER appuser

EXPOSE 3000

# `-r newrelic` carrega o agente ANTES de qualquer módulo da aplicação — é o
# que permite instrumentar Fastify, Prisma e o driver do Postgres. Sem
# NEW_RELIC_LICENSE_KEY o agente fica desligado e nada é enviado.
ENV NODE_OPTIONS="-r newrelic"

# `exec` no lugar do shell: sem ele, o `sh` fica como PID 1 e o SIGTERM do
# Kubernetes nunca chega ao Node, quebrando o encerramento gracioso.
# O binário local do Prisma em vez de `npx`: sem resolução de pacote nem
# escrita de cache no start.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/server.js"]