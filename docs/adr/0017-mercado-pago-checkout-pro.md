# ADR-0017: Mercado Pago com Checkout Pro, webhook verificado e modo simulado

**Status:** Aceita

## Contexto

O pagamento precisa ser integrado ao Mercado Pago e fazer parte da saga: pagamento confirmado libera o reparo, e uma compensação depois do pagamento precisa estornar o cliente. O ambiente de avaliação (Learner Lab) não tem domínio próprio, e a demonstração não pode depender de credenciais pessoais.

## Decisão

- **Checkout Pro:** ao aprovar o orçamento, o Billing cria uma preferência (`POST /checkout/preferences`) com os itens, `external_reference` igual ao id do orçamento e `notification_url` apontando para `/pagamentos/webhook` no API Gateway. O link volta para a OS e vai por e-mail ao cliente. Com token de teste (`TEST-...`), usa o `sandbox_init_point`.
- **O webhook nunca é fonte da verdade.** A notificação traz só o id do pagamento; o Billing consulta `GET /v1/payments/{id}` e decide pelo status retornado. Quando `MERCADO_PAGO_WEBHOOK_SECRET` está configurado, a assinatura `x-signature` é validada (HMAC-SHA256 sobre `id`, `request-id` e `ts`) antes de qualquer consulta.
- **Estorno com idempotência:** `POST /v1/payments/{id}/refunds` com `X-Idempotency-Key` derivada do orçamento. Se a compensação for reprocessada depois de um erro, o Mercado Pago não estorna duas vezes.
- **Dinheiro que não quita o orçamento volta sozinho:** pagamento depois do cancelamento, segundo pagamento de orçamento já pago ou valor menor que o total são estornados automaticamente.
- **Modo simulado** (`MERCADO_PAGO_MODO=simulado`, padrão sem token): a cobrança devolve um link local e `POST /pagamentos/simulador/{orcamentoId}` produz o mesmo efeito do webhook. O pipeline liga o modo real sozinho quando o secret `MERCADO_PAGO_ACCESS_TOKEN` existe.

## Consequências

**Positivas:**
- A saga, o BDD e a demonstração funcionam sem conta no Mercado Pago, e o código do caminho real é o mesmo depois que o pagamento é obtido.
- Uma notificação forjada ou repetida não muda o estado sem confirmação na API do Mercado Pago.

**Negativas:**
- Um pagamento recusado encerra a saga (OS cancelada). Num produto real, o cliente poderia tentar outro meio até a preferência expirar.
- O simulador não existe no modo real (responde 404), mas no modo simulado é público por definição; não deve ficar ligado num ambiente com dinheiro de verdade.
