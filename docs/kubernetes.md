# Kubernetes

Manifests declarativos em `/k8s/` que descrevem o estado desejado da aplicação no cluster. Aplicados manualmente (local) ou pelo job de deploy do CI/CD (produção).

---

## Visão geral dos recursos

```
namespace "oficina"
├── ConfigMap       oficina-config      variáveis não-sensíveis
├── Secret          oficina-secret      credenciais (criado fora dos manifests)
├── PVC             postgres-pvc        volume persistente do banco
├── Deployment      postgres            banco de dados PostgreSQL
├── Service         postgres            acesso interno ao banco (ClusterIP)
├── Deployment      oficina-api         API Node.js (2 réplicas)
├── Service         oficina-api         exposição via NodePort :30000
└── HPA             oficina-api-hpa     escalonamento automático (2–10 réplicas)
```

---

## Namespace

**Arquivo:** `k8s/namespace.yaml`

Isola todos os recursos da aplicação. Label `app.kubernetes.io/part-of: oficina` permite filtrar recursos por projeto.

```bash
kubectl get all -n oficina
```

---

## ConfigMap

**Arquivo:** `k8s/configmap.yaml`

Armazena variáveis de ambiente **não-sensíveis**. Pode ser inspecionado livremente:

| Chave           | Valor                                    |
|-----------------|------------------------------------------|
| `NODE_ENV`      | `production`                             |
| `PORT`          | `3000`                                   |
| `HOST`          | `0.0.0.0`                                |
| `POSTGRES_DB`   | `oficina_db`                             |
| `POSTGRES_USER` | `oficina`                                |
| `JWT_EXPIRES_IN`| `8h`                                     |
| `BCRYPT_ROUNDS` | `12`                                     |
| `SMTP_PORT`     | `587`                                    |
| `SMTP_FROM`     | `Oficina Mecânica <noreply@oficina.com>` |

```bash
kubectl describe configmap oficina-config -n oficina
```

---

## Secret

**Arquivo:** `k8s/secret.example.yaml` (template de referência — nunca commitar valores reais)

Armazena credenciais sensíveis em Base64. **Nunca é criado pelo `kubectl apply` automático** — deve ser criado manualmente ou pelo Terraform/CI/CD.

| Chave               | Descrição                          |
|---------------------|------------------------------------|
| `POSTGRES_PASSWORD` | Senha do PostgreSQL                |
| `JWT_SECRET`        | Chave de assinatura dos tokens JWT |
| `SMTP_HOST`         | Host do servidor SMTP (opcional)   |
| `SMTP_USER`         | Usuário SMTP (opcional)            |
| `SMTP_PASS`         | Senha SMTP (opcional)              |

**Criação manual (local):**
```bash
kubectl create secret generic oficina-secret \
  --namespace=oficina \
  --from-literal=POSTGRES_PASSWORD="sua_senha" \
  --from-literal=JWT_SECRET="sua_chave_jwt_minimo_32_chars" \
  --from-literal=SMTP_HOST="" \
  --from-literal=SMTP_USER="" \
  --from-literal=SMTP_PASS=""
```

> O Terraform cria o Secret automaticamente ao provisionar o cluster local (valores lidos do `terraform.tfvars`).

---

## PostgreSQL

**Arquivos:** `k8s/postgres-pvc.yaml`, `k8s/postgres-deployment.yaml`, `k8s/postgres-service.yaml`

### PVC (PersistentVolumeClaim)

Volume de 1 Gi com acesso `ReadWriteOnce`. Garante que os dados do banco sobrevivam a reinicializações do pod.

### Deployment

- Imagem: `postgres:16-alpine`
- Variáveis não-sensíveis vêm do **ConfigMap**; senha vem do **Secret**
- Dados persistidos em `/var/lib/postgresql/data` via PVC

### Probes (3 camadas)

| Probe            | Objetivo                                              | Configuração          |
|------------------|-------------------------------------------------------|-----------------------|
| `startupProbe`   | Aguarda o banco inicializar antes de tudo             | 30 × 5s = até 150s   |
| `readinessProbe` | Remove pod do Service se banco não responder          | a cada 10s            |
| `livenessProbe`  | Reinicia container se o processo travar definitivamente | a cada 30s          |

Comando de verificação: `pg_isready -U oficina -d oficina_db`

### Service

Tipo `ClusterIP` — visível apenas dentro do cluster, acessível pelos pods da API pelo hostname `postgres:5432`.

---

## API

**Arquivos:** `k8s/api-deployment.yaml`, `k8s/api-service.yaml`, `k8s/hpa.yaml`

### Deployment

- **Réplicas:** 2 (mínimo garantido)
- **Imagem:** substituída dinamicamente via `sed` — o arquivo fonte contém o placeholder `DOCKER_IMAGE_PLACEHOLDER`
- **`imagePullPolicy: IfNotPresent`** — usa imagem local se já existir no nó (essencial para ambiente Kind)
- **`DATABASE_URL`** é montada via expansão de variáveis do Kubernetes: `postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@postgres:5432/$(POSTGRES_DB)`

### Recursos por pod

| Tipo    | CPU     | Memória |
|---------|---------|---------|
| Request | 100m    | 128Mi   |
| Limit   | 500m    | 512Mi   |

### Probes (3 camadas)

| Probe            | Endpoint       | Objetivo                                            | Configuração        |
|------------------|----------------|-----------------------------------------------------|---------------------|
| `startupProbe`   | `GET /health`  | Aguarda app inicializar (migrações, conexão com DB) | 30 × 5s = até 150s  |
| `readinessProbe` | `GET /health`  | Remove pod do balanceamento se não responder        | a cada 10s          |
| `livenessProbe`  | `GET /health`  | Reinicia se travar após startup bem-sucedida        | a cada 30s          |

> A `startupProbe` desabilita as outras duas enquanto o app está inicializando. Isso evita reinicializações prematuras durante migrações do banco.

### Service

Tipo `NodePort` na porta `30000`. O Kind mapeia essa porta para o host, tornando a API acessível em `http://localhost:30000`.

### HPA (Horizontal Pod Autoscaler)

Escalonamento automático baseado em uso de recursos:

| Métrica   | Gatilho | Mínimo | Máximo |
|-----------|---------|--------|--------|
| CPU       | 70%     | 2      | 10     |
| Memória   | 80%     | 2      | 10     |

```bash
kubectl get hpa -n oficina
kubectl describe hpa oficina-api-hpa -n oficina
```

---

## Comandos úteis

```bash
# Aplicar todos os manifests (via script)
./scripts/k8s-deploy.sh oficina:local

# Verificar estado dos pods
kubectl get pods -n oficina
kubectl get all -n oficina

# Logs da API
kubectl logs -n oficina -l app=oficina-api --tail=50 -f

# Logs do PostgreSQL
kubectl logs -n oficina -l app=postgres --tail=50

# Descrever um pod com falha
kubectl describe pod <nome-do-pod> -n oficina

# Acompanhar rollout
kubectl rollout status deployment/oficina-api -n oficina

# Reverter deploy com problema
kubectl rollout undo deployment/oficina-api -n oficina

# Testar endpoint
curl http://localhost:30000/health
```
