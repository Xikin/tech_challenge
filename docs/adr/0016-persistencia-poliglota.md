# ADR-0016: PostgreSQL por serviço, MongoDB no Billing e Redis como cache

**Status:** Aceita

## Contexto

A Fase 4 exige ao menos um banco relacional e um não relacional, com um banco por serviço. A escolha de cada um deveria seguir o formato dos dados e as consultas de cada serviço, não só cumprir o requisito.

## Decisão

| Serviço | Banco | Por quê |
| --- | --- | --- |
| OS Service | **PostgreSQL** | Clientes, veículos e OS são relacionais, com unicidade (CPF, placa, número da OS) e transações que juntam OS, histórico, saga e outbox. |
| Execução | **PostgreSQL** (instância própria) | O estoque precisa de baixa condicionada (`quantidade >= n`) dentro da transação que conclui o diagnóstico; é exatamente o que o banco relacional faz bem. |
| Billing | **MongoDB** | O orçamento é uma foto: itens e preços congelados no momento em que foi gerado. A resposta do Mercado Pago muda de formato por meio de pagamento. As consultas são sempre por chave (`_id`, `ordemId`). E um documento único dá atomicidade entre estado, pagamento e outbox sem transação distribuída. |
| OS Service | **Redis** (cache) | A consulta pública de status é a rota mais lida, e o cliente fica atualizando a página. Também guarda o contador do limite de tentativas. |

**Uso do Redis:**
- **Cache-aside** da consulta pública (`os:publica:{numero}`, 60 s). A chave guarda o hash do CPF/CNPJ: um documento diferente recebe 404, como receberia do banco, sem ir ao banco. A chave é apagada a cada mudança de status da OS.
- **Armazenamento do `@fastify/rate-limit`**. Antes, cada pod contava as tentativas de login em memória; com 2 a 10 réplicas, o limite de 5 virava até 50.
- **Falha aberta.** Se o Redis cair, a leitura vai direto ao banco e o limite de tentativas é ignorado (`skipOnError`), em vez de derrubar a API.

**Onde rodam:** PostgreSQL no RDS (duas instâncias); MongoDB 8 em StatefulSet com volume EBS no namespace do Billing, ou no Atlas se o secret `MONGODB_URI` for informado; Redis 7 em Deployment sem persistência, porque é só cache.

## Consequências

**Positivas:**
- Cada banco é usado no que faz melhor, e a escolha é defensável pelo dado, não pelo requisito.
- O cache reduz carga no RDS justamente na rota pública, que é a mais exposta a abuso.

**Negativas:**
- Três tecnologias de banco para operar, cada uma com backup e monitoramento próprios.
- O MongoDB no cluster tem uma réplica só: perda do nó com o volume significa restaurar de snapshot do EBS. Em produção real, o Atlas (ou um replica set de três membros) resolveria.
