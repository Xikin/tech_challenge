# Kubernetes

O OS Service roda no EKS provisionado por [oficina-infra-k8s](https://github.com/Xikin/oficina-infra-k8s), no namespace `oficina`, ao lado dos serviços de Execução e Billing. O RabbitMQ fica no namespace `plataforma`, gerenciado pelo repositório de infraestrutura.

## Recursos deste repositório

```
namespace oficina
├── ConfigMap      oficina-os-config   variáveis não sensíveis (REDIS_URL, exchange, tentativas, New Relic)
├── Secret         oficina-os-secret   criado pelo pipeline a partir do SSM; modelo em k8s/secret.example.yaml
├── Deployment     oficina-os          API + consumidor da saga + relay do outbox (2 a 10 réplicas)
├── Service        oficina-os          LoadBalancer (NLB) — backend do API Gateway
├── HPA            oficina-os-hpa      CPU 70% / memória 80%
├── Deployment     oficina-os-redis    cache e limite de tentativas, sem persistência
├── Service        oficina-os-redis    ClusterIP :6379
└── NetworkPolicy  oficina-os-redis    só pods app=oficina-os falam com o Redis
```

| Arquivo | Conteúdo |
| --- | --- |
| [`k8s/namespace.yaml`](../k8s/namespace.yaml) | Namespace `oficina` |
| [`k8s/configmap.yaml`](../k8s/configmap.yaml) | Configuração não sensível |
| [`k8s/secret.example.yaml`](../k8s/secret.example.yaml) | Chaves esperadas no Secret |
| [`k8s/deployment.yaml`](../k8s/deployment.yaml) | Probes, limites, usuário não-root, sistema de arquivos só-leitura |
| [`k8s/service.yaml`](../k8s/service.yaml) | NLB com health check em `/health/ready` |
| [`k8s/hpa.yaml`](../k8s/hpa.yaml) | Autoscaling |
| [`k8s/redis.yaml`](../k8s/redis.yaml) | Redis + Service + NetworkPolicy |

O mesmo processo atende HTTP, consome a fila `os.saga` e roda o relay do outbox. Com várias réplicas, o consumo é dividido pelo RabbitMQ (`prefetch: 1` por réplica) e o relay divide as linhas com `FOR UPDATE SKIP LOCKED`, então escalar a API escala também o processamento da saga.

## Segredos

| Chave | Origem |
| --- | --- |
| `DATABASE_URL` | SSM `/oficina/<env>/db/database_url` (oficina-infra-db) |
| `RABBITMQ_URL` | SSM `/oficina/<env>/mensageria/rabbitmq_url` (oficina-infra-k8s) |
| `JWT_SECRET`, `JWT_CLIENTE_SECRET` | Secrets do GitHub; o pipeline também publica no SSM para os outros serviços |
| `INTEGRACAO_API_KEY` | Gerada pelo pipeline no SSM na primeira vez; lida também pela Lambda |
| `NEW_RELIC_LICENSE_KEY`, `SMTP_*` | Secrets do GitHub (opcionais) |

## Operação

```bash
CLUSTER=$(aws ssm get-parameter --name /oficina/prod/eks/cluster_name --query Parameter.Value --output text)
aws eks update-kubeconfig --region us-east-1 --name "$CLUSTER"

kubectl get pods,svc,hpa -n oficina
kubectl logs -n oficina -l app=oficina-os --tail=50 -f
kubectl rollout undo deployment/oficina-os -n oficina

kubectl port-forward -n plataforma svc/rabbitmq 15672
```

O painel do RabbitMQ (http://localhost:15672, usuário `oficina`, senha em `/oficina/<env>/mensageria/rabbitmq_password`) mostra as filas `os.saga`, `execucao.comandos`, `billing.comandos` e as respectivas `.retry` e `.dlq`.

## Capacidade

Com os três serviços, Redis, MongoDB, RabbitMQ e os agentes do New Relic, o cluster passa de 25 pods. Por isso o node group foi para `t3.medium` (17 pods por nó), detalhado no README do oficina-infra-k8s.
