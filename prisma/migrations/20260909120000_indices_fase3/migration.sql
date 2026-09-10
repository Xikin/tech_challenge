-- Fase 3: índices de suporte a consultas e painéis.
--
-- O schema da Fase 2 não tinha nenhum índice além das PKs e dos UNIQUEs
-- implícitos. Toda chave estrangeira e a coluna `status` — que é o eixo
-- dos painéis de volume diário e tempo médio por status — provocavam
-- sequential scan. Todos os comandos abaixo são aditivos: nenhum altera
-- dados nem restringe o que já era aceito.

-- CreateIndex
CREATE INDEX "clientes_nome_idx" ON "clientes"("nome");

-- CreateIndex
CREATE INDEX "clientes_ativo_idx" ON "clientes"("ativo");

-- CreateIndex
CREATE INDEX "historico_os_ordem_id_criado_em_idx" ON "historico_os"("ordem_id", "criado_em");

-- CreateIndex
CREATE INDEX "historico_os_status_novo_criado_em_idx" ON "historico_os"("status_novo", "criado_em");

-- CreateIndex
CREATE INDEX "itens_peca_os_ordem_id_idx" ON "itens_peca_os"("ordem_id");

-- CreateIndex
CREATE INDEX "itens_peca_os_peca_id_idx" ON "itens_peca_os"("peca_id");

-- CreateIndex
CREATE INDEX "itens_servico_os_ordem_id_idx" ON "itens_servico_os"("ordem_id");

-- CreateIndex
CREATE INDEX "itens_servico_os_servico_id_idx" ON "itens_servico_os"("servico_id");

-- CreateIndex
CREATE INDEX "ordens_servico_status_idx" ON "ordens_servico"("status");

-- CreateIndex
CREATE INDEX "ordens_servico_cliente_id_idx" ON "ordens_servico"("cliente_id");

-- CreateIndex
CREATE INDEX "ordens_servico_veiculo_id_idx" ON "ordens_servico"("veiculo_id");

-- CreateIndex
CREATE INDEX "ordens_servico_status_criado_em_idx" ON "ordens_servico"("status", "criado_em");

-- CreateIndex
CREATE INDEX "pecas_ativo_idx" ON "pecas"("ativo");

-- CreateIndex
CREATE INDEX "servicos_ativo_idx" ON "servicos"("ativo");

-- CreateIndex
CREATE INDEX "veiculos_cliente_id_idx" ON "veiculos"("cliente_id");

