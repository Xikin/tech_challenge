# CI/CD

Pipeline automatizado no GitHub Actions definido em `.github/workflows/ci-cd.yml`. Executa em todo **push** e **pull request** para a branch `main`.

---

## Visão geral

```
push → main
    │
    ├── [1] test      Build + testes + cobertura
    │       │
    │       └── [2] docker   Build e push da imagem → GHCR
    │               │
    │               └── [3] deploy   Deploy no cluster Kubernetes
```

Os jobs **docker** e **deploy** só executam em push direto para `main` (não em pull requests).

---

## Jobs

### Job 1 — `test` (Build & Test)

Executa em todo push e PR. Garante que nenhum código quebrado chega à `main`.

**Serviço auxiliar:** PostgreSQL 16-alpine (container efêmero para os testes de integração)

**Variáveis de ambiente usadas:**

| Variável          | Origem                     |
|-------------------|----------------------------|
| `DATABASE_URL`    | Monta com `secrets.POSTGRES_PASSWORD` |
| `JWT_SECRET`      | `secrets.JWT_SECRET`       |
| `BCRYPT_ROUNDS`   | `4` (hardcoded — mais rápido em CI) |
| `NODE_ENV`        | `test`                     |

**Passos:**
1. Checkout do código
2. Setup Node.js 20 com cache npm
3. `npm ci --frozen-lockfile`
4. `npx prisma generate`
5. `npx prisma migrate deploy` (aplica migrações no DB de teste)
6. `npm run build` (verifica erros de compilação TypeScript)
7. `npm test` (Vitest com cobertura)
8. Upload do relatório de cobertura como artefato (7 dias de retenção)

---

### Job 2 — `docker` (Build & Push Docker Image)

Executa apenas em push para `main`, após o job `test` passar.

**Permissões necessárias:**
- `contents: read`
- `packages: write` (para publicar no GHCR)

**Registry:** GitHub Container Registry (`ghcr.io`)

**Tags geradas automaticamente:**

| Tag                          | Exemplo                                           |
|------------------------------|---------------------------------------------------|
| SHA completo do commit       | `ghcr.io/usuario/oficina:sha-abc1234...`         |
| `latest`                     | `ghcr.io/usuario/oficina:latest`                 |

**Output para o próximo job:**
```
image_ref: ghcr.io/usuario/oficina:<sha-do-commit>
```

**Cache:** GitHub Actions Cache (`type=gha`) — acelera builds subsequentes reutilizando camadas Docker.

---

### Job 3 — `deploy` (Deploy Kubernetes)

Executa apenas em push para `main`, após o job `docker` gerar a imagem.

**Roda num runner self-hosted**, não no `ubuntu-latest` da GitHub — o cluster é um Kind local (Docker na sua máquina), com a API em `127.0.0.1`, inacessível a partir de um runner na nuvem. Veja [Runner self-hosted](#runner-self-hosted) abaixo antes de tentar rodar este job.

**Passos em detalhe:**

**1. Configurar `kubectl` e validar acesso ao cluster**
```bash
# KUBECONFIG já vem definido no ambiente do runner (arquivo .env do runner,
# não do workflow — ver seção "Runner self-hosted")
kubectl cluster-info
```

**2. Namespace e ConfigMap**
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
```

**3. Secret com credenciais** (idempotente via `--dry-run + apply`)
```bash
kubectl create secret generic oficina-secret \
  --from-literal=POSTGRES_PASSWORD="..." \
  --from-literal=JWT_SECRET="..." \
  --dry-run=client -o yaml | kubectl apply -f -
```
O `--dry-run=client -o yaml | kubectl apply -f -` garante que o comando funciona tanto na primeira execução (cria) quanto nas seguintes (atualiza sem erro de conflito).

**4. PostgreSQL**
```bash
kubectl apply -f k8s/postgres-pvc.yaml
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/postgres-service.yaml
kubectl rollout status deployment/postgres -n oficina --timeout=120s
```

**5. API** (substituição da imagem via `sed`)
```bash
sed "s|DOCKER_IMAGE_PLACEHOLDER|$IMAGE_REF|g" k8s/api-deployment.yaml \
  | kubectl apply -f -
kubectl apply -f k8s/api-service.yaml
kubectl apply -f k8s/hpa.yaml
kubectl rollout status deployment/oficina-api -n oficina --timeout=180s
```
O `sed` substitui o placeholder pela imagem exata do commit atual antes de aplicar o manifest.

---

## Secrets do GitHub necessários

Configure em: **Settings → Secrets and variables → Actions**

| Secret              | Descrição                                                |
|---------------------|----------------------------------------------------------|
| `POSTGRES_PASSWORD` | Senha do PostgreSQL                                      |
| `JWT_SECRET`        | Chave JWT (mínimo 32 caracteres aleatórios)             |
| `SMTP_HOST`         | Host SMTP (pode ser vazio se não usar e-mail)           |
| `SMTP_USER`         | Usuário SMTP (pode ser vazio)                           |
| `SMTP_PASS`         | Senha SMTP (pode ser vazio)                             |

Não há secret `KUBECONFIG` — o job `deploy` roda num runner self-hosted que já tem acesso direto ao cluster local (ver abaixo). Se um dia o cluster for movido para a cloud, aí sim volta a fazer sentido guardar o kubeconfig como secret e usar um runner hospedado pela GitHub novamente.

---

## Runner self-hosted

O job `deploy` (`runs-on: self-hosted`) precisa de uma máquina sua registrada como runner, porque o cluster Kind só existe localmente.

**1. Registrar o runner** — em **Settings → Actions → Runners → New self-hosted runner** no GitHub, escolha Linux/x64 e siga os comandos que a própria página gera (`config.sh --url ... --token ...`, token expira em minutos).

**2. Instalar como serviço** (para sobreviver a reinícios):
```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

**3. Expor o `KUBECONFIG` para os jobs** — crie um arquivo `.env` na raiz da pasta do runner (`actions-runner/.env`) com o caminho absoluto do kubeconfig gerado pelo Terraform nessa mesma máquina:
```bash
echo "KUBECONFIG=/caminho/absoluto/para/oficina-mvp/infra/oficina-config" >> ~/actions-runner/.env
sudo ./svc.sh stop && sudo ./svc.sh start   # recarrega o .env
```
O runner injeta automaticamente as variáveis desse `.env` em todo job — por isso o workflow não precisa (nem deve) montar o `KUBECONFIG` a partir do checkout, já que a work dir do job é diferente do diretório onde você rodou `terraform apply` manualmente.

**4. Pré-requisitos na máquina do runner**: `docker`, `kind`, `kubectl` instalados, e o cluster já criado via `terraform apply` (ver [terraform.md](terraform.md)) antes do primeiro push que dispare o `deploy`.

---

## Fluxo completo de uma entrega

```
Desenvolvedor faz push para main
        │
        ▼
[test] Instala deps → Roda migrações → Build TS → Vitest
        │ aprovado
        ▼
[docker] Build multi-stage → Push ghcr.io/usuario/oficina:<sha>
        │ publicado
        ▼
[deploy] kubectl aplica namespace → configmap → secret
              → postgres → api (com imagem do SHA atual)
              → hpa
        │ rollout concluído
        ▼
API disponível no cluster com a versão exata do commit
```

---

## Comportamento por evento

| Evento                   | `test` | `docker` | `deploy` |
|--------------------------|--------|----------|----------|
| Push para `main`         | ✅     | ✅       | ✅       |
| Pull Request para `main` | ✅     | ❌       | ❌       |
| Push para outra branch   | ❌     | ❌       | ❌       |

---

## Artefatos gerados

| Artefato      | Onde                     | Retenção |
|---------------|--------------------------|----------|
| `coverage/`   | GitHub Actions Artifacts | 7 dias   |
| Imagem Docker | `ghcr.io` (GHCR)        | Indefinida (gerenciada pelo GHCR) |
