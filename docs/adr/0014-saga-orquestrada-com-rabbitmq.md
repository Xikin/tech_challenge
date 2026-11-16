# ADR-0014: Saga orquestrada pelo OS Service sobre RabbitMQ

**Status:** Aceita — substitui em parte a [ADR-0002](0002-comunicacao-sincrona-rest.md)

## Contexto

Abrir uma OS, diagnosticar, orçar, aprovar, pagar e executar envolve os três serviços, cada um com o próprio banco. Não existe transação que cubra os três. Se o pagamento for recusado ou a execução falhar depois de paga, o que já foi feito nos outros serviços precisa ser desfeito: peças reservadas voltam ao estoque e o pagamento é estornado.

O Saga Pattern admite dois estilos: **coreografado**, em que cada serviço reage a eventos dos outros, e **orquestrado**, em que um coordenador central envia comandos e recebe as respostas.

## Decisão

**Saga orquestrada**, com o **OS Service** como orquestrador e o **RabbitMQ** como transporte.

- O estado da saga mora na tabela `sagas_os`, ao lado da OS. A máquina de estados é uma função pura (`src/domain/saga/saga-os.ts`): recebe o estado atual e um evento e devolve o novo estado, o novo status da OS e os comandos a enviar.
- Participantes não conhecem uns aos outros: recebem comandos em `execucao.comandos` e `billing.comandos` e respondem com eventos que só o orquestrador consome (fila `os.saga`).
- A compensação é **por participante**: o orquestrador manda `execucao.comando.cancelar` e `billing.comando.cancelar` a todos que já participaram, e cada um sabe desfazer a própria parte (o Execução devolve peças reservadas; o Billing estorna se havia pagamento ou só cancela o orçamento). As duas compensações correm em paralelo, porque são independentes. A OS só fica `CANCELADA` quando todas forem confirmadas.
- REST continua sendo a porta de entrada síncrona (abrir OS, aprovar orçamento, ações do mecânico). O que atravessa serviços é sempre mensagem.

Por que orquestrada e não coreografada:

| Critério | Orquestrada (escolhida) | Coreografada |
| --- | --- | --- |
| Onde está o fluxo | Um arquivo, testável sem infraestrutura | Espalhado em três repositórios |
| Compensação | Decidida num lugar, com a lista exata de quem participou | Cada serviço precisa saber de quais eventos alheios depende |
| Estado para o vídeo e para o suporte | `GET /ordens/:id/saga` mostra etapa e cada mensagem | Precisa reconstruir pelos logs |
| Acoplamento | Orquestrador conhece o contrato dos participantes | Participantes conhecem eventos uns dos outros |
| Ponto único de falha | O orquestrador; mitigado pelo outbox e pela fila durável | Não há |

O fluxo tem poucos participantes e uma ordem rígida (sem orçamento não há pagamento, sem pagamento não há reparo). Nesse cenário, ter a regra num só lugar pesa mais que a autonomia da coreografia.

## Consequências

**Positivas:**
- O BDD exercita a saga inteira — caminho feliz e as três compensações — em memória, sem broker.
- Um evento que chega fora de ordem é tratado de forma explícita: se pertence a uma etapa futura volta para a fila de retentativa; se pertence a uma etapa passada é registrado e ignorado.

**Negativas:**
- O OS Service vira peça central: fora do ar, a saga pausa (as mensagens esperam na fila durável e nada se perde).
- Mudanças de fluxo exigem mudar o orquestrador e o contrato, versionado no campo `versao` do envelope.

**Reavaliar se:** surgirem participantes que só precisam reagir a fatos (notificações, BI); para eles, eventos publicados pelo próprio OS Service, consumidos de forma coreografada, são mais simples.
