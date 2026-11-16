# Alertas

O enunciado exige explicitamente **"alertas para falhas no processamento de ordens
de serviço"**. Os demais cobrem latência, saúde e infraestrutura.

Criar em **Alerts → Alert conditions → NRQL**, todos numa policy chamada
`oficina-producao` com notificação por e-mail (ou Slack).

> **Pré-requisito.** Estes alertas só funcionam porque a aplicação passou a
> *emitir* o sinal. Até a Fase 3, falhas de envio de e-mail eram engolidas por
> `.catch(() => {})` e erros 4xx não geravam log nenhum — nenhuma ferramenta
> conseguiria alertar sobre o que não é publicado.

---

## 1. Falha no processamento de ordens de serviço  ⭐ exigido

**Por que existe:** a notificação ao cliente falhou (SMTP fora, endereço inválido).
A OS avançou de status, mas o cliente não foi avisado — é uma falha silenciosa do
processo de atendimento.

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-os' AND evento = 'falha_integracao'
```

| Parâmetro | Valor |
| --- | --- |
| Threshold | acima de `0` por pelo menos 5 minutos |
| Prioridade | Critical |
| Janela de agregação | 5 minutos |
| Sinal perdido | ignorar (ausência de falha é o estado normal) |

---

## 2. Erro interno na aplicação

**Por que existe:** exceção não tratada — resposta 500 ao usuário.

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-os' AND evento = 'erro_interno'
```

| Parâmetro | Valor |
| --- | --- |
| Threshold | acima de `3` em 5 minutos |
| Prioridade | Critical |

---

## 3. Banco de dados inacessível

**Por que existe:** a readinessProbe está falhando; os pods saem do balanceamento e
a API fica indisponível mesmo com os containers "de pé".

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-os' AND evento = 'readiness_falhou'
```

| Parâmetro | Valor |
| --- | --- |
| Threshold | acima de `0` por 3 minutos |
| Prioridade | Critical |

---

## 4. Autenticação por CPF indisponível

**Por que existe:** a Lambda não consegue falar com o RDS — nenhum cliente novo
consegue entrar.

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-auth-lambda' AND level = 'error'
```

| Parâmetro | Valor |
| --- | --- |
| Threshold | acima de `2` em 5 minutos |
| Prioridade | Critical |

---

## 5. Latência degradada

**Por que existe:** a API responde, mas mal. Antecede a indisponibilidade.

```sql
SELECT percentile(duration, 95) * 1000
FROM Transaction
WHERE appName = 'oficina-os'
```

| Parâmetro | Valor |
| --- | --- |
| Threshold | acima de `1000` ms por 5 minutos |
| Prioridade | Warning |

---

## 6. Taxa de erro 5xx no gateway

```sql
SELECT percentage(count(*), WHERE numeric(status) >= 500)
FROM Log
WHERE aws.logGroup LIKE '/aws/apigateway/oficina%'
```

| Parâmetro | Valor |
| --- | --- |
| Threshold | acima de `5`% por 5 minutos |
| Prioridade | Critical |

---

## 7. Pods reiniciando

**Por que existe:** crashloop ou OOMKill. Costuma ser o primeiro sinal de um deploy
ruim.

```sql
SELECT sum(restartCount)
FROM K8sContainerSample
WHERE containerName = 'oficina-os'
```

| Parâmetro | Valor |
| --- | --- |
| Threshold | aumento acima de `2` em 10 minutos |
| Prioridade | Warning |

---

## 8. HPA no teto

**Por que existe:** o autoscaling chegou ao limite; a próxima onda de tráfego
degrada. É o alerta de capacidade, não de falha.

```sql
SELECT latest(podsDesired)
FROM K8sReplicasetSample
WHERE deploymentName = 'oficina-os'
```

| Parâmetro | Valor |
| --- | --- |
| Threshold | igual a `10` (o `maxReplicas`) por 10 minutos |
| Prioridade | Warning |

---

## 9. Uptime — synthetic check

Criar em **Synthetic monitoring → Create monitor → Availability**:

| Campo | Valor |
| --- | --- |
| Nome | `oficina-os-health` |
| URL | `https://<API_GATEWAY_URL>/health/ready` |
| Frequência | 5 minutos |
| Localidades | `us-east-1`, `sa-east-1` |
| Condição de alerta | falha em 2 de 3 localidades |
| Prioridade | Critical |

Usar `/health/ready` e não `/health`: o endpoint raso responde 200 mesmo com o
banco fora, e mediria apenas se o processo Node está vivo.

---

## 10. Token forjado — segredo JWT vazado

**Por que existe:** a assinatura só confere para quem tem um dos segredos JWT. Um
token com assinatura válida que alega um papel ou emissor que aquele segredo não pode
emitir significa **segredo vazado sendo usado para escalar privilégio**
(ver [ADR-0011](../docs/adr/0011-segredos-jwt-por-emissor.md)). Um único evento já
justifica rotacionar os dois segredos.

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-os' AND evento = 'token_emissor_invalido'
```

| Parâmetro | Valor |
| --- | --- |
| Threshold | acima de `0` em 5 minutos |
| Prioridade | Critical |

---

## 11. Pico de bloqueios por limite de tentativas

**Por que existe:** alguns bloqueios por hora são usuários errando a senha. Um pico
indica força bruta contra contas ou varredura da consulta pública
(ver [ADR-0012](../docs/adr/0012-limites-de-tentativa.md)). O `rota` mostra qual das duas.

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-os' AND evento = 'erro_negocio' AND codigo = 'RATE_LIMITED'
FACET rota
```

| Parâmetro | Valor |
| --- | --- |
| Threshold | acima de `20` em 5 minutos |
| Prioridade | Warning |

---

## 12. Mensagem na fila de mortas

**Por que existe:** mensagem na DLQ é uma OS parada no meio da saga. Ou um
participante falhou cinco vezes seguidas (banco fora, Mercado Pago fora durante um
estorno), ou alguém publicou fora do contrato. O log traz `fila`, `tipoMensagem`,
`sagaId` e o último erro; a mensagem fica na fila `*.dlq` com o cabeçalho
`x-ultimo-erro` para ser reenviada pelo painel do RabbitMQ depois da correção.

```sql
SELECT count(*)
FROM Log
WHERE service IN ('oficina-os', 'oficina-execucao', 'oficina-billing')
  AND evento = 'mensagem_falhou' AND destino LIKE '%.dlq'
FACET service, tipoMensagem
```

| Parâmetro | Valor |
| --- | --- |
| Threshold | acima de `0` em 5 minutos |
| Prioridade | Critical |

---

## 13. Mercado Pago indisponível

**Por que existe:** com o Mercado Pago fora, a aprovação do orçamento devolve 502
e o estorno de uma compensação entra em retentativa. Se persistir além das
tentativas, vira o alerta 12.

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-billing' AND evento = 'falha_integracao' AND integracao = 'mercado_pago'
```

| Parâmetro | Valor |
| --- | --- |
| Threshold | acima de `2` em 5 minutos |
| Prioridade | Critical |

---

## 14. Pico de compensações da saga

**Por que existe:** compensação isolada é negócio (cliente reprovou). Muitas em
pouco tempo indicam problema sistêmico: preço errado no catálogo gerando
reprovações, cartão recusado por configuração do Mercado Pago, falha de execução
em série. O `motivo` diz qual.

```sql
SELECT count(*)
FROM Log
WHERE service = 'oficina-os' AND evento = 'saga_compensacao_iniciada'
FACET motivo
```

| Parâmetro | Valor |
| --- | --- |
| Threshold | acima de `5` em 15 minutos |
| Prioridade | Warning |

---

## 15. RabbitMQ inacessível

**Por que existe:** a reconexão ao broker é automática com backoff; este evento só
aparece quando ela desiste. As requisições HTTP continuam funcionando e o outbox
acumula, mas nenhuma OS avança até o broker voltar e o pod ser reiniciado.

```sql
SELECT count(*)
FROM Log
WHERE service IN ('oficina-os', 'oficina-execucao', 'oficina-billing')
  AND evento = 'mensageria_reconexao_falhou'
FACET service
```

| Parâmetro | Valor |
| --- | --- |
| Threshold | acima de `0` em 5 minutos |
| Prioridade | Critical |

---

## Verificando os alertas antes da apresentação

Disparar de propósito, para provar que a cadeia funciona:

```bash
# 1. Falha de integração: aponte o SMTP para um host inexistente e avance
#    o status de uma OS cujo cliente tenha e-mail cadastrado.
kubectl set env deployment/oficina-os -n oficina SMTP_HOST=smtp.invalido.local

# 2. Banco inacessível: remova temporariamente a regra de ingress do RDS
#    (ou aponte a DATABASE_URL para um host errado).
#    A readinessProbe começa a falhar em ~30s.

# 3. Latência: gere carga e observe o HPA subir junto.
kubectl run carga --rm -it --image=busybox --restart=Never -- \
  sh -c 'while true; do wget -qO- http://oficina-os.oficina/health >/dev/null; done'
```

Lembre de reverter o passo 1 depois:

```bash
kubectl set env deployment/oficina-os -n oficina --from=secret/oficina-secret
```
