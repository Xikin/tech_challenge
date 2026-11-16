-- Fase 4: o catálogo (serviços e peças) e o estoque passam para o
-- oficina-execucao, que tem banco próprio. A OS deixa de referenciar o
-- catálogo por chave estrangeira e guarda uma cópia dos itens orçados
-- (nome, quantidade e preço do momento), que é o que o cliente aprovou.
--
-- Os itens das OS existentes são copiados para itens_os antes de as
-- tabelas antigas serem removidas, então nenhuma OS perde a composição.

CREATE TYPE "TipoItemOS" AS ENUM ('SERVICO', 'PECA');

CREATE TYPE "EtapaSaga" AS ENUM ('DIAGNOSTICO', 'ORCAMENTO', 'APROVACAO', 'PAGAMENTO', 'EXECUCAO', 'CONCLUIDA');

CREATE TYPE "StatusSaga" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDA', 'COMPENSANDO', 'COMPENSADA');

CREATE TYPE "DirecaoPasso" AS ENUM ('ENVIADA', 'RECEBIDA');

ALTER TYPE "StatusOS" ADD VALUE 'AGUARDANDO_PAGAMENTO';
ALTER TYPE "StatusOS" ADD VALUE 'AGUARDANDO_EXECUCAO';

ALTER TABLE "ordens_servico" ADD COLUMN     "link_pagamento" TEXT,
ADD COLUMN     "orcamento_id" TEXT,
ADD COLUMN     "pago_em" TIMESTAMP(3);

CREATE TABLE "itens_os" (
    "id" TEXT NOT NULL,
    "ordem_id" TEXT NOT NULL,
    "tipo" "TipoItemOS" NOT NULL,
    "referencia_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "preco_unitario" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "itens_os_pkey" PRIMARY KEY ("id")
);

INSERT INTO "itens_os" ("id", "ordem_id", "tipo", "referencia_id", "nome", "quantidade", "preco_unitario")
SELECT i."id", i."ordem_id", 'SERVICO', i."servico_id", s."nome", 1, i."preco"
FROM "itens_servico_os" i
JOIN "servicos" s ON s."id" = i."servico_id";

INSERT INTO "itens_os" ("id", "ordem_id", "tipo", "referencia_id", "nome", "quantidade", "preco_unitario")
SELECT i."id", i."ordem_id", 'PECA', i."peca_id", p."nome", i."quantidade", i."preco"
FROM "itens_peca_os" i
JOIN "pecas" p ON p."id" = i."peca_id";

ALTER TABLE "itens_peca_os" DROP CONSTRAINT "itens_peca_os_ordem_id_fkey";
ALTER TABLE "itens_peca_os" DROP CONSTRAINT "itens_peca_os_peca_id_fkey";
ALTER TABLE "itens_servico_os" DROP CONSTRAINT "itens_servico_os_ordem_id_fkey";
ALTER TABLE "itens_servico_os" DROP CONSTRAINT "itens_servico_os_servico_id_fkey";

DROP TABLE "itens_peca_os";
DROP TABLE "itens_servico_os";
DROP TABLE "pecas";
DROP TABLE "servicos";

CREATE TABLE "sagas_os" (
    "id" TEXT NOT NULL,
    "ordem_id" TEXT NOT NULL,
    "etapa" "EtapaSaga" NOT NULL,
    "status" "StatusSaga" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "compensacoes_pendentes" TEXT[],
    "participantes" TEXT[],
    "motivo_falha" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sagas_os_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "passos_saga" (
    "id" TEXT NOT NULL,
    "saga_id" TEXT NOT NULL,
    "direcao" "DirecaoPasso" NOT NULL,
    "tipo" TEXT NOT NULL,
    "mensagem_id" TEXT NOT NULL,
    "detalhe" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passos_saga_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox" (
    "id" TEXT NOT NULL,
    "routing_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "cabecalhos" JSONB NOT NULL DEFAULT '{}',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicado_em" TIMESTAMP(3),

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mensagens_processadas" (
    "id" TEXT NOT NULL,
    "consumidor" TEXT NOT NULL,
    "processada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_processadas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "itens_os_ordem_id_idx" ON "itens_os"("ordem_id");

CREATE UNIQUE INDEX "sagas_os_ordem_id_key" ON "sagas_os"("ordem_id");

CREATE INDEX "sagas_os_status_etapa_idx" ON "sagas_os"("status", "etapa");

CREATE INDEX "passos_saga_saga_id_criado_em_idx" ON "passos_saga"("saga_id", "criado_em");

CREATE INDEX "outbox_publicado_em_criado_em_idx" ON "outbox"("publicado_em", "criado_em");

ALTER TABLE "itens_os" ADD CONSTRAINT "itens_os_ordem_id_fkey" FOREIGN KEY ("ordem_id") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sagas_os" ADD CONSTRAINT "sagas_os_ordem_id_fkey" FOREIGN KEY ("ordem_id") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "passos_saga" ADD CONSTRAINT "passos_saga_saga_id_fkey" FOREIGN KEY ("saga_id") REFERENCES "sagas_os"("id") ON DELETE CASCADE ON UPDATE CASCADE;
