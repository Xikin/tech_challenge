# Consultas NRQL

Todas as consultas dos painéis e alertas, em texto, para colar direto no New Relic
(**Query your data**) sem depender da importação do JSON.

O JSON pronto para importar está em [`dashboard.json`](dashboard.json); os alertas,
em [`alertas.md`](alertas.md).

> **Como os dados chegam aqui.** A aplicação emite logs JSON estruturados (pino) e o
> agente New Relic os encaminha com `application_logging.forwarding`. Cada linha
> carrega `service`, `env`, `evento` e o `reqId` de correlação. Eventos de negócio
> (`os_criada`, `os_status_alterado`, `falha_integracao`) são emitidos
> explicitamente pelos casos de uso — não são inferidos de status HTTP.

> **Atenção aos tipos.** O access log do API Gateway grava todos os valores como texto
> (`"status": "200"`, `"latenciaMs": "42"`). Comparações e agregações numéricas sobre
> esses campos precisam de `numeric()`; sem ele, `status >= 500` nunca é verdadeiro.

---

## 1. Volume diário de ordens de serviço

Painel exigido: *"volume diário de ordens de serviço"*.

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-api' AND evento = 'os_criada'
TIMESERIES 1 day
SINCE 30 days ago
```

Total do período, para o número grande:

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-api' AND evento = 'os_criada'
SINCE 7 days ago COMPARE WITH 7 days ago
```

Faturamento das OS abertas por dia:

```sql
SELECT sum(valorTotal)
FROM Log
WHERE service = 'oficina-api' AND evento = 'os_criada'
TIMESERIES 1 day SINCE 30 days ago
```

---

## 2. Tempo médio de execução por status

Painel exigido: *"tempo médio de execução por status (Diagnóstico, Execução,
Finalização)"*.

`duracaoNoStatusAnteriorMs` é calculado no caso de uso a partir de
`historico_os.criado_em` — o timestamp gerado pelo próprio banco — e não das
colunas de cache da OS, que podem divergir (ver `docs/modelo-de-dados.md`, seção 6).

```sql
SELECT average(duracaoNoStatusAnteriorMs) / 3600000 AS 'Horas em média'
FROM Log
WHERE service = 'oficina-api' AND evento = 'os_status_alterado'
FACET statusAnterior
SINCE 30 days ago
```

Evolução ao longo do tempo, só nos três status que o enunciado cita:

```sql
SELECT average(duracaoNoStatusAnteriorMs) / 3600000
FROM Log
WHERE service = 'oficina-api'
  AND evento = 'os_status_alterado'
  AND statusAnterior IN ('EM_DIAGNOSTICO', 'EM_EXECUCAO', 'FINALIZADA')
FACET statusAnterior
TIMESERIES 1 day SINCE 30 days ago
```

Percentis, que revelam a cauda que a média esconde:

```sql
SELECT percentile(duracaoNoStatusAnteriorMs / 3600000, 50, 90, 99)
FROM Log
WHERE service = 'oficina-api' AND evento = 'os_status_alterado'
FACET statusAnterior
SINCE 30 days ago
```

Funil — quantas OS passaram por cada transição:

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-api' AND evento = 'os_status_alterado'
FACET statusAnterior, statusNovo
SINCE 30 days ago
```

---

## 3. Erros e falhas nas integrações

Painel exigido: *"erros e falhas nas integrações"*.

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-api' AND evento = 'falha_integracao'
FACET integracao, operacao
TIMESERIES 1 hour SINCE 24 hours ago
```

Detalhe das últimas falhas, com o id de correlação para investigar:

```sql
SELECT timestamp, integracao, operacao, numeroOS, erro, reqId
FROM Log
WHERE service = 'oficina-api' AND evento = 'falha_integracao'
SINCE 24 hours ago LIMIT 100
```

Erros não tratados (5xx) da aplicação:

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-api' AND evento = 'erro_interno'
FACET rota
TIMESERIES SINCE 24 hours ago
```

Erros na Lambda de autenticação:

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-auth-lambda' AND level = 'error'
TIMESERIES SINCE 24 hours ago
```

---

## 4. Latência das APIs

Requisito: *"latência das APIs"*.

```sql
SELECT percentile(duration, 50, 95, 99) * 1000 AS 'ms'
FROM Transaction
WHERE appName = 'oficina-api'
TIMESERIES SINCE 6 hours ago
```

Rotas mais lentas:

```sql
SELECT average(duration) * 1000 AS 'ms médio', count(*) AS 'chamadas'
FROM Transaction
WHERE appName = 'oficina-api'
FACET name
SINCE 24 hours ago LIMIT 20
```

Latência do API Gateway, incluindo o salto até o cluster:

```sql
SELECT average(numeric(latenciaMs)), percentile(numeric(latenciaMs), 95)
FROM Log
WHERE aws.logGroup LIKE '/aws/apigateway/oficina%'
FACET routeKey
TIMESERIES SINCE 6 hours ago
```

Latência da autenticação por CPF, ponta a ponta:

```sql
SELECT average(duracaoMs), percentile(duracaoMs, 95, 99)
FROM Log
WHERE service = 'oficina-auth-lambda' AND evento IS NULL AND duracaoMs IS NOT NULL
TIMESERIES SINCE 6 hours ago
```

Taxa de erro por status HTTP:

```sql
SELECT count(*)
FROM Log
WHERE aws.logGroup LIKE '/aws/apigateway/oficina%'
FACET cases(
  WHERE numeric(status) < 300 AS '2xx',
  WHERE numeric(status) < 400 AS '3xx',
  WHERE numeric(status) < 500 AS '4xx',
  WHERE numeric(status) >= 500 AS '5xx'
)
TIMESERIES SINCE 6 hours ago
```

---

## 5. Consumo de recursos do Kubernetes

Requisito: *"consumo de recursos do Kubernetes (CPU, memória)"*.
Dados vindos do `nri-bundle` (ver [README](README.md)).

```sql
SELECT average(cpuUsedCores / cpuLimitCores) * 100 AS 'CPU %'
FROM K8sContainerSample
WHERE containerName = 'oficina-api'
TIMESERIES SINCE 3 hours ago
```

```sql
SELECT average(memoryWorkingSetBytes) / 1048576 AS 'MB'
FROM K8sContainerSample
WHERE containerName = 'oficina-api'
FACET podName
TIMESERIES SINCE 3 hours ago
```

Réplicas em execução — é este gráfico que prova o HPA funcionando no vídeo:

```sql
SELECT latest(podsDesired), latest(podsReady)
FROM K8sReplicasetSample
WHERE deploymentName = 'oficina-api'
TIMESERIES SINCE 3 hours ago
```

Nós do cluster:

```sql
SELECT average(allocatableCpuCoresUtilization), average(allocatableMemoryUtilization)
FROM K8sNodeSample
FACET nodeName
TIMESERIES SINCE 3 hours ago
```

Pods reiniciando (sintoma de crashloop ou OOM):

```sql
SELECT latest(restartCount)
FROM K8sContainerSample
WHERE containerName = 'oficina-api'
FACET podName
SINCE 24 hours ago
```

---

## 6. Healthchecks e uptime

Requisito: *"healthchecks e uptime"*.

Disponibilidade medida pelo synthetic check externo:

```sql
SELECT percentage(count(*), WHERE result = 'SUCCESS') AS 'Uptime %'
FROM SyntheticCheck
WHERE monitorName = 'oficina-api-health'
SINCE 7 days ago TIMESERIES 1 hour
```

Readiness falhando (o pod não alcança o RDS):

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-api' AND evento = 'readiness_falhou'
FACET dependencia
TIMESERIES SINCE 24 hours ago
```

Reinícios da aplicação:

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-api' AND evento = 'servidor_iniciado'
TIMESERIES 1 hour SINCE 24 hours ago
```

---

## 7. Segurança e autorização

Não é exigido, mas é o sinal que mostra o guard do papel CLIENTE em ação:

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-api' AND evento = 'acesso_negado'
FACET motivo, role
TIMESERIES SINCE 24 hours ago
```

Tentativas de autenticação por CPF que falharam:

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-auth-lambda' AND level = 'warn'
FACET message
TIMESERIES SINCE 24 hours ago
```

---

## 8. Seguir uma requisição ponta a ponta

Correlação exigida: *"logs estruturados (JSON), incluindo correlação entre
requisições"*. Com um `x-request-id` em mãos:

```sql
SELECT timestamp, service, level, message, evento
FROM Log
WHERE reqId = 'COLE-O-ID-AQUI' OR correlationId = 'COLE-O-ID-AQUI'
SINCE 1 day ago LIMIT 200
```

O mesmo identificador aparece no access log do gateway, no log da Lambda e no log
da aplicação — e é devolvido ao chamador no header `x-request-id` de toda resposta.
