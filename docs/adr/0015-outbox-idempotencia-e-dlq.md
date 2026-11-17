# ADR-0015: Outbox transacional, consumidores idempotentes e fila de mortas

**Status:** Aceita

## Contexto

Cada passo da saga precisa gravar o próprio estado e avisar outro serviço. Gravar no banco e publicar no RabbitMQ são duas operações independentes: se o processo cair entre as duas, ou o estado muda sem aviso (a saga trava) ou o aviso sai sem o estado (a saga diverge). Além disso, o RabbitMQ entrega cada mensagem **pelo menos uma vez**, então duplicatas acontecem.

## Decisão

**Outbox transacional em todos os serviços.** A mensagem é gravada na mesma transação da mudança de estado e publicada depois por um relay:

| Serviço | Onde fica o outbox | Atomicidade |
| --- | --- | --- |
| OS Service e Execução | tabela `outbox` no PostgreSQL | transação do Prisma junto com a mudança |
| Billing | array `saidas` dentro do documento do orçamento | atualização de um único documento no MongoDB, que é atômica sem transação |

O relay publica com **publisher confirms** e `mandatory`: só marca como publicada a mensagem que o broker confirmou e entregou a alguma fila. Sem fila de destino (por exemplo, o serviço participante ainda não subiu), a mensagem continua pendente e é reenviada no ciclo seguinte. No PostgreSQL as linhas são reservadas com `FOR UPDATE SKIP LOCKED`, então várias réplicas dividem o trabalho sem publicar a mesma linha duas vezes.

**Consumidores idempotentes.** Cada mensagem tem um `id`. O orquestrador e o Execução registram o `id` em `mensagens_processadas` na mesma transação que aplica o efeito, e descartam repetições. O Billing é idempotente pelo próprio dado: orçamento único por OS e transições condicionadas ao status atual.

**Concorrência otimista.** A saga e o orçamento têm `versao`; a gravação só acontece se a versão não mudou. Quando duas réplicas processam eventos da mesma OS ao mesmo tempo, uma perde e a mensagem é reprocessada.

**Retentativa com atraso e fila de mortas.** Cada fila `X` tem `X.retry` (TTL configurável, volta para `X` ao expirar) e `X.dlq`. Erro transitório vai para a retentativa com o contador `x-tentativas`; esgotadas as tentativas, ou se a mensagem for inválida, vai para a DLQ com `x-ultimo-erro`.

## Consequências

**Positivas:**
- Nenhuma mudança de estado fica sem aviso, e nenhum aviso sai sem o estado correspondente.
- Testado com o broker real e duas réplicas do orquestrador concorrendo: 19 eventos adiados e 20 conflitos de versão foram resolvidos pela retentativa, sem nada na DLQ.

**Negativas:**
- Entrega é *at-least-once* com deduplicação, não *exactly-once*: um participante pode receber o mesmo comando duas vezes e precisa ser idempotente.
- A ordem entre mensagens da mesma saga não é garantida quando há várias réplicas. O orquestrador compensa isso adiando eventos que chegam antes da hora.
- Mensagem na DLQ exige ação humana. O alerta da DLQ no New Relic é o que garante que alguém veja.
