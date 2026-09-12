# Desenvolvimento

---

## Execução local

```bash
# Instala dependências
npm install

# Configura banco
cp .env.example .env
npm run db:migrate
npm run db:seed

# Inicia com hot-reload
npm run dev
```

---

## Testes

```bash
# Todos os testes
npm test

# Com relatório de cobertura (≥ 80%)
npm run test:coverage

# Modo watch
npm run test:watch
```

---

## Variáveis de ambiente

Onde cada variável é definida em cada ambiente — local (`.env`), produção (manifestos em [`/k8s`](../k8s)) e CI (`env:` do job em [`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml)):

| Variável              | Padrão                        | Produção (K8s)                                 | CI                              |
| ---------------------- | ------------------------------ | ------------------------------------------------ | --------------------------------- |
| `NODE_ENV`             | `development`                  | ConfigMap (`production`)                          | `test` (hardcoded)                |
| `PORT`                 | `3000`                         | ConfigMap                                         | `3000`                            |
| `HOST`                 | `0.0.0.0`                      | ConfigMap                                         | —                                  |
| `DATABASE_URL`         | — (obrigatória)                | Montada no Deployment a partir de `POSTGRES_*`    | Secret `POSTGRES_PASSWORD` + literais |
| `JWT_SECRET`           | — (obrigatória, ≥32 chars)     | **Secret** `oficina-secret`                       | Secret `JWT_SECRET`               |
| `JWT_CLIENTE_SECRET`           | — (obrigatória, ≥32 chars)     | **Secret** `oficina-secret`                       | Secret `JWT_CLIENTE_SECRET`               |
| `JWT_EXPIRES_IN`       | `8h`                           | ConfigMap                                         | —                                  |
| `BCRYPT_ROUNDS`        | `12`                           | ConfigMap                                         | `4` (mais rápido em CI)           |
| `SMTP_HOST/USER/PASS`  | vazio (e-mail desabilitado)    | **Secret** `oficina-secret` (opcionais)           | —                                  |
| `SMTP_PORT`            | `587`                          | ConfigMap                                         | —                                  |
| `SMTP_FROM`            | `Oficina Mecânica <...>`       | ConfigMap                                         | —                                  |
| `ALLOWED_ORIGINS`      | vazio (bloqueia cross-origin)  | ConfigMap (vazio até haver frontend configurado)  | —                                  |

Todas as variáveis locais ficam em `.env` (copiado de `.env.example`). As marcadas como **Secret** nunca vão para o ConfigMap nem para o Git — em produção são criadas via `kubectl create secret` (ver [`k8s/secret.example.yaml`](../k8s/secret.example.yaml)) ou pelo Terraform ([docs/terraform.md](terraform.md)); em CI vêm dos GitHub Secrets do repositório.

---

## Comandos úteis

```bash
npm run db:migrate    # Aplica migrations pendentes
npm run db:studio     # Abre Prisma Studio (GUI)
npm run db:seed       # Popula dados iniciais
npm run build         # Compila TypeScript
```
