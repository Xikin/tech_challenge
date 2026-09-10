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

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

# `-r newrelic` carrega o agente ANTES de qualquer módulo da aplicação — é o
# que permite instrumentar Fastify, Prisma e o driver do Postgres. Sem
# NEW_RELIC_LICENSE_KEY o agente fica desligado e nada é enviado.
ENV NODE_OPTIONS="-r newrelic"

# `exec` no lugar do shell: sem ele, o `sh` fica como PID 1 e o SIGTERM do
# Kubernetes nunca chega ao Node, quebrando o encerramento gracioso.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/server.js"]