# Observabilidade

Como a plataforma é monitorada e como reproduzir os painéis do zero.

Decisão e justificativa da ferramenta:
[ADR-0010](../docs/adr/0010-observabilidade-new-relic.md).

| Arquivo | Conteúdo |
| --- | --- |
| [`consultas.md`](consultas.md) | Todas as consultas NRQL, em texto, para colar no New Relic |
| [`alertas.md`](alertas.md) | As 10 condições de alerta, com threshold e justificativa |
| [`dashboard.json`](dashboard.json) | Dashboard pronto para importar |

---

## Requisitos da Fase 3 e onde cada um é atendido

| Requisito | Sinal | Origem |
| --- | --- | --- |
| Latência das APIs | `Transaction.duration`, `latenciaMs` do gateway | agente APM + access log |
| CPU e memória do Kubernetes | `K8sContainerSample`, `K8sNodeSample` | `nri-bundle` |
| Healthchecks e uptime | `SyntheticCheck`, `evento = 'readiness_falhou'` | synthetic + aplicação |
| Alertas de falha no processamento de OS | `evento = 'falha_integracao'` | casos de uso |
| Logs estruturados JSON | todas as linhas | pino, JSON manual na Lambda, access log |
| Correlação entre requisições | `reqId` / `correlationId` | `x-request-id` propagado |
| Volume diário de OS | `evento = 'os_criada'` | `CriarOrdemUseCase` |
| Tempo médio por status | `duracaoNoStatusAnteriorMs` | `AvancarStatusUseCase` |
| Erros e falhas nas integrações | `evento = 'falha_integracao'`, `erro_interno` | error handler e casos de uso |

---

## Eventos de negócio emitidos pela aplicação

Os painéis não inferem nada de status HTTP: os casos de uso publicam eventos
explícitos, que sobrevivem a mudanças de rota e de status code.

| `evento` | Emitido por | Campos relevantes |
| --- | --- | --- |
| `os_criada` | `CriarOrdemUseCase` | `numeroOS`, `clienteId`, `qtdServicos`, `qtdPecas`, `valorTotal` |
| `os_status_alterado` | `AvancarStatusUseCase` | `statusAnterior`, `statusNovo`, `duracaoNoStatusAnteriorMs` |
| `falha_integracao` | `AvancarStatusUseCase`, `AprovarOrcamentoUseCase` | `integracao`, `operacao`, `numeroOS`, `erro` |
| `erro_negocio` | `setErrorHandler` | `codigo`, `statusCode`, `rota` |
| `erro_validacao` | `setErrorHandler` | `codigo`, `rota` |
| `erro_interno` | `setErrorHandler` | `rota`, `err` |
| `acesso_negado` | `exigirInterno`, `exigirDonoDoRecurso` | `motivo`, `role`, `sub` |
| `token_emissor_invalido` | `autenticar` | `emissor`, `iss`, `role`, `sub` — assinatura válida com papel incompatível: indica segredo vazado |
| `readiness_falhou` | `/health/ready` | `dependencia` |
| `servidor_iniciado` / `encerramento_*` | `server.ts` | `sinal` |

`duracaoNoStatusAnteriorMs` vem de `historico_os.criado_em` (timestamp gerado pelo
banco), e não das colunas de cache da OS — ver
[modelo-de-dados.md](../docs/modelo-de-dados.md), seção 6.

---

## Configuração, do zero

### 1. Conta e chave

1. Criar conta gratuita em <https://newrelic.com/signup> — 100 GB/mês, sem cartão.
2. Copiar a **license key** (ingest key) em *Administration → API keys*.
3. Anotar o **Account ID** (aparece na URL da conta).

### 2. APM da aplicação

Já está no código. Basta a chave chegar ao pod:

```bash
kubectl create secret generic oficina-secret -n oficina \
  --from-literal=NEW_RELIC_LICENSE_KEY='<sua-chave>' \
  ... (demais chaves) \
  --dry-run=client -o yaml | kubectl apply -f -
```

No pipeline, é o secret `NEW_RELIC_LICENSE_KEY` do repositório.

O agente é carregado por `NODE_OPTIONS="-r newrelic"` no `Dockerfile` e configurado
em [`newrelic.cjs`](../newrelic.cjs). **Sem a chave, o agente não sobe** e a
aplicação funciona normalmente sem telemetria.

### 3. Infraestrutura do Kubernetes

```bash
helm repo add newrelic https://helm-charts.newrelic.com
helm repo update

helm upgrade --install newrelic-bundle newrelic/nri-bundle \
  --namespace newrelic --create-namespace \
  --set global.licenseKey='<sua-chave>' \
  --set global.cluster='oficina-prod' \
  --set newrelic-infrastructure.privileged=true \
  --set kube-state-metrics.enabled=true \
  --set nri-kube-events.enabled=true \
  --set newrelic-logging.enabled=true \
  --set global.lowDataMode=true
```

`lowDataMode=true` reduz bastante a ingestão — relevante para não estourar os
100 GB gratuitos com um cluster de laboratório.

Conferir:

```bash
kubectl get pods -n newrelic
```

### 4. Métricas da AWS (RDS, Lambda, API Gateway)

Em *Infrastructure → AWS → Add AWS account*, escolher **metric streams** ou
**API polling**.

> No AWS Academy Learner Lab a integração por role costuma falhar, porque não é
> possível criar a IAM role que o New Relic pede (ver
> [ADR-0005](https://github.com/Xikin/oficina-infra-k8s/blob/main/docs/adr/0005-restricoes-aws-academy.md)).
> Alternativa que funciona: encaminhar os log groups do CloudWatch por uma
> subscription filter para a Lambda `newrelic-log-ingestion`, ou simplesmente
> consultar os logs no CloudWatch para esses três componentes. Os painéis de OS,
> latência e Kubernetes — que são os exigidos — não dependem desta etapa.

### 5. Dashboard

*Dashboards → Import dashboard* e colar o conteúdo de
[`dashboard.json`](dashboard.json), **substituindo `ACCOUNT_ID_AQUI` pelo seu
Account ID numérico**:

```bash
sed "s/ACCOUNT_ID_AQUI/1234567/g" observabilidade/dashboard.json > /tmp/dashboard.json
```

Se a importação falhar por diferença de versão do schema, use
[`consultas.md`](consultas.md) — todas as consultas estão em texto para montar os
widgets à mão.

### 6. Alertas e synthetic

Seguir [`alertas.md`](alertas.md). São 9 condições NRQL numa policy mais 1 monitor
sintético.

---

## Diagnóstico rápido

```bash
# O agente subiu?
kubectl logs -n oficina -l app=oficina-api | grep -i "newrelic"

# Logs estruturados saindo em JSON?
kubectl logs -n oficina -l app=oficina-api --tail=20

# Seguir uma requisição específica ponta a ponta
curl -s -D- http://<URL>/health -H 'x-request-id: teste-123' | grep -i x-request-id
kubectl logs -n oficina -l app=oficina-api | grep teste-123

# Logs da Lambda
aws logs tail /aws/lambda/oficina-prod-auth --follow --format short

# Access log do gateway
aws logs tail /aws/apigateway/oficina-prod --follow --format short
```

Se o agente não aparecer nos logs, quase sempre é a `NEW_RELIC_LICENSE_KEY` ausente
ou vazia no Secret — é o comportamento projetado, não uma falha.
