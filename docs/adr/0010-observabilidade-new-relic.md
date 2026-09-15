# ADR-0010: New Relic como stack de observabilidade

**Status:** Aceita
**Data:** 2026-09-09

## Contexto

A Fase 3 exige monitorar latência de API, CPU e memória do Kubernetes, healthchecks
e uptime, alertas para falhas no processamento de ordens de serviço, logs
estruturados com correlação, e três painéis (volume diário de OS, tempo médio por
status, erros de integração). O enunciado sugere Datadog ou New Relic, com escolha
livre.

Restrições reais do projeto: crédito limitado do AWS Academy, e a entrega inclui um
vídeo com "dashboard de monitoramento com análise ao vivo" — ou seja, a ferramenta
precisa estar **funcionando na data da gravação**, não durante um teste gratuito.

## Alternativas

| | New Relic | Datadog | CloudWatch + Managed Grafana |
| --- | --- | --- | --- |
| Camada gratuita | 100 GB/mês permanente, 1 usuário full, sem cartão | 14 dias de trial para APM; depois só infra básica | pago por uso |
| APM Node.js | agente maduro | agente maduro | precisa de OpenTelemetry manual |
| Integração Kubernetes | `nri-bundle` via Helm | agente DaemonSet | Container Insights |
| Logs em contexto | nativo, injeta `trace.id` no pino | nativo | correlação manual |
| Custo no lab | zero | zero por 14 dias | consome crédito |
| Alinhamento ao enunciado | citado | citado | não citado |

## Decisão

**New Relic**, pela camada gratuita permanente.

O fator decisivo é o vídeo: o APM do Datadog vira trial de 14 dias. Se a gravação
acontecer fora dessa janela — o que é provável, porque o vídeo costuma ser a última
etapa — o painel simplesmente para de receber dados, e a demonstração exigida se
torna impossível de refazer sem pagar.

### Componentes

| Sinal | Como é coletado |
| --- | --- |
| APM da API | agente `newrelic` carregado com `-r newrelic` no `CMD` |
| Infra do Kubernetes | `nri-bundle` via Helm (CPU, memória, pods, eventos) |
| Logs da aplicação | `application_logging.forwarding` do agente, direto do pino |
| Logs da Lambda e do gateway | CloudWatch → integração AWS do New Relic |
| Traces | distributed tracing (W3C `traceparent`) + X-Ray na Lambda |
| Uptime | synthetic check externo contra `/health/ready` |

### O que precisou mudar na aplicação antes

Instrumentar não bastava. Três correções precederam a observabilidade, porque **o
sinal não era emitido**:

1. `setErrorHandler` só logava o ramo 500. Erros 4xx — validação e regra de negócio
   — não geravam linha nenhuma. Nenhum alerta sobre eles era possível.
2. Três `.catch(() => {})` engoliam falhas de envio de e-mail. É exatamente a
   "falha no processamento de ordens de serviço" que o enunciado manda alertar.
3. `TIMESTAMP_CAMPO` avaliava `new Date()` uma única vez, no carregamento do
   módulo: toda ordem recebia o horário de boot do processo em `aprovadoEm`,
   `iniciadoEm`, `finalizadoEm` e `entregueEm`. O painel de tempo médio por status
   construído sobre essas colunas daria durações zeradas ou negativas.

Instalar o agente sem corrigir isso produziria painéis bonitos e errados.

### Privacidade

`attributes.exclude` remove `authorization`, `cookie`, `senha`, `password`, `cpf` e
`cpfCnpj`. `record_sql: 'obfuscated'` registra a forma da query, nunca os valores.
Na Lambda, o CPF é mascarado (`***.***.247-25`) antes de qualquer log.

### Ruído de alerta

`error_collector.ignore_status_codes` inclui 400, 401, 403, 404, 409 e 422. São
respostas de negócio esperadas; contá-las como erro inflaria a taxa de erro e
dispararia alerta falso a cada login digitado errado.

## Consequências

**Positivas**
- Custo zero e sem prazo, sobrevivendo até a entrega e depois dela.
- Logs em contexto: clicar num trace lento mostra as linhas de log daquela
  requisição específica, sem consulta manual.
- Um só produto cobre APM, infraestrutura, logs, sintéticos e alertas.

**Negativas**
- O agente adiciona ~30 MB de RSS por pod — por isso `requests.memory` subiu de
  128Mi para 256Mi.
- Dependência de SaaS externo: sem `NEW_RELIC_LICENSE_KEY`, o agente fica desligado
  e a aplicação perde toda a telemetria (mas continua funcionando).
- NRQL é uma linguagem a mais para o time aprender.

**Mitigação**
- O agente é opcional por construção: `agent_enabled` só é verdadeiro quando a
  licença existe. Desenvolvimento e testes rodam sem ele.
- Os logs continuam saindo em JSON no stdout, então CloudWatch e `kubectl logs`
  seguem sendo um caminho de diagnóstico independente do New Relic.
