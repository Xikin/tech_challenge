# Qualidade e Segurança

---

## SonarQube — Análise Estática

### Pré-requisitos

- Docker com ao menos **4 GB de RAM** alocados (requisito do SonarQube)
- Configurar `vm.max_map_count` no host (necessário para Elasticsearch interno):

```bash
# Linux / WSL2
sudo sysctl -w vm.max_map_count=262144

# macOS (Docker Desktop)
# Configurações → Resources → Memory: 4 GB+
```

### Subir SonarQube

```bash
# Sobe apenas SonarQube + seu banco
npm run sonar:up

# Aguarda ~2 minutos e acessa:
open http://localhost:9000
# Login padrão: admin / admin
# (O SonarQube pedirá para trocar a senha no primeiro acesso)
```

### Executar o scan

```bash
# Gera cobertura + sobe Sonar + executa scanner (tudo em um comando)
npm run sonar

# OU passo a passo:
npm run test:coverage          # gera coverage/lcov.info
npm run sonar:up               # sobe SonarQube
npm run sonar:scan             # roda o scanner

# Com token de autenticação (recomendado após trocar senha):
SONAR_TOKEN=seu_token npm run sonar
```

### Criar token no SonarQube

1. Acesse **http://localhost:9000**
2. Faça login (`admin` / senha que definiu)
3. Clique no avatar → **My Account** → **Security**
4. Em **Generate Tokens** → nome: `oficina-scan` → **Generate**
5. Copie o token e use:

```bash
SONAR_TOKEN=squ_xxxxxxxxxxxxxxxx npm run sonar
# ou salve no .env:
echo "SONAR_TOKEN=squ_xxxxxxxxxxxxxxxx" >> .env
```

### Ver relatório

```
http://localhost:9000/dashboard?id=oficina-mvp
```

### Resultados (última análise — 2026-04-29)

| Métrica           | Valor                            | Rating |
| ----------------- | -------------------------------- | ------ |
| Bugs              | 0                                | A      |
| Vulnerabilidades  | 0                                | A      |
| Security Hotspots | 0                                | A      |
| Code Smells       | 10 (todos MINOR/MAJOR de estilo) | A      |
| Cobertura         | 89,8%                            | —      |
| Duplicação        | 6,4%                             | —      |
| Dívida técnica    | 0,1%                             | A      |

Relatório detalhado: [`reports/sonarqube-report.md`](../reports/sonarqube-report.md)

### Parar SonarQube

```bash
npm run sonar:down
# ou para remover volumes também:
docker compose down -v sonarqube sonar_postgres
```

### Arquivos relacionados

| Arquivo                    | Função                                                  |
| -------------------------- | ------------------------------------------------------- |
| `sonar-project.properties` | Configuração do scanner (sources, exclusões, lcov path) |
| `scripts/sonar-scan.sh`    | Script que orquestra teste → scan                       |
| `docker-compose.yml`       | Serviços `sonar_postgres`, `sonarqube`, `sonar_scanner` |
| `vitest.config.ts`         | Gera `coverage/lcov.info`                               |

---

## OWASP ZAP — Segurança em Execução

Scan completo (Spider + Active Scan) contra a API em execução.

```bash
# Suba a aplicação
docker compose up -d

# Execute o scan (gera relatórios em reports/)
mkdir -p reports
docker run --rm --network host \
  -v $(pwd)/reports:/zap/wrk/:rw \
  --user root \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-full-scan.py -t http://localhost:3000 \
  -r zap-report.html -J zap-report.json -x zap-report.xml -I
```

### Resultados (última análise — 2026-04-29)

| Risco    | Alerta                               | Observação                                                    |
| -------- | ------------------------------------ | ------------------------------------------------------------- |
| ✅ Corrigido | CORS Misconfiguration                | `origin: true` reflete qualquer origem — resolvido (ver abaixo) |
| 🟡 Médio | HTTP Only Site                       | Esperado em dev — usar HTTPS em produção                      |
| ℹ️ Info  | Storable and Cacheable Content       | Adicionar `Cache-Control: no-store` em endpoints sensíveis    |
| ✅ —     | SQL Injection, XSS, RCE, Auth Bypass | Nenhuma vulnerabilidade encontrada                            |

**Correção do CORS** (`src/app.ts`):

```typescript
// Antes (inseguro — reflete qualquer origem, em qualquer ambiente, com credenciais)
await app.register(fastifyCors, { origin: true, credentials: true });

// Depois — allowlist explícita vinda de ALLOWED_ORIGINS (validada em src/config/env.ts),
// sem credentials: a API autentica via Authorization: Bearer, não usa cookies.
const allowedOrigins = env.ALLOWED_ORIGINS.split(',').filter(Boolean);
await app.register(fastifyCors, { origin: allowedOrigins });
```

`ALLOWED_ORIGINS` vem do `ConfigMap` em produção ([`k8s/configmap.yaml`](../k8s/configmap.yaml)) e do `.env` em desenvolvimento. Vazio por padrão — fail-closed: nenhuma origem cross-origin é permitida até ser explicitamente configurada.

Relatório detalhado: [`reports/owasp-zap-report.md`](../reports/owasp-zap-report.md)

---

## Endurecimento da revisão de segurança (Fase 3)

Correções aplicadas depois de uma revisão dos quatro repositórios. Cada item foi
verificado com teste automatizado ou execução real, não só por leitura de código.

| Achado | Correção | Registro |
| --- | --- | --- |
| Token ADMIN forjável com o segredo da Lambda | Um segredo por emissor e papel amarrado ao emissor | [ADR-0011](adr/0011-segredos-jwt-por-emissor.md) |
| Senha fixa `Admin@123` no seed, aplicada no ambiente publicado | Senha por variável, gerada ou com opt-in de desenvolvimento | `prisma/seed.ts` |
| CPF em claro nos logs e no New Relic | Máscara no serializer de requisição; `path` fora do access log do gateway | `src/shared/utils/mascarar-documentos.ts` |
| Força bruta no login e na consulta pública | Limite por e-mail e por número de OS | [ADR-0012](adr/0012-limites-de-tentativa.md) |
| Enumeração de contas pelo tempo de resposta do login | bcrypt sempre executado, contra hash fictício | [ADR-0012](adr/0012-limites-de-tentativa.md) |
| Processo podia reescrever o próprio código | Arquivos com dono root, `readOnlyRootFilesystem`, escrita só em `/tmp`. Efeito colateral: a imagem caiu de 672 MB para 397 MB, porque o `chown -R` antigo duplicava `/app` inteiro numa camada | `Dockerfile`, `k8s/api-deployment.yaml` |
| Lambda sem teto podia esgotar as conexões do RDS | `reserved_concurrent_executions` | `oficina-auth-lambda` |
| Actions referenciadas por tag móvel | Pin por SHA de commit, atualizado pelo Dependabot | `.github/dependabot.yml` |
| `GITHUB_TOKEN` com permissão padrão do repositório | `permissions: contents: read` no topo dos workflows | workflows |
| `/auth/me` respondia 500 para cliente sem e-mail | Schema corrigido | `auth.schema.ts` |

### Pendências conhecidas

| Achado | Por que ficou | Próximo passo |
| --- | --- | --- |
| 22 vulnerabilidades em dependências de produção (1 crítica no `fast-jwt`) | Correção exige upgrades major: fastify 5, @fastify/jwt 10, nodemailer 10 | PRs do Dependabot, um major por vez |
| API e Lambda usam o usuário master do RDS | Criar roles no banco exige o ambiente AWS no ar | Roles `oficina_app` (DML) e `oficina_auth_ro` (SELECT) |
| Autenticação só por CPF permite enumerar clientes | Exigência do enunciado; a mitigação completa pede segundo fator | Resposta uniforme e código por e-mail |
| Tokens não revogáveis por 8h | Exige estado no servidor | TTL curto com refresh, ou versão de token no usuário |
| TLS com o banco sem verificar certificado | `rejectUnauthorized: false` na Lambda; `sslmode` ausente | Empacotar o bundle CA do RDS e usar `verify-full` |
| Imagem com dependências de desenvolvimento e migrations no start | Separar migração exige um Job no pipeline | `npm prune --omit=dev` e Job de migração |
| Endpoint do EKS público e nós com IP público | Custo de NAT no AWS Academy ([ADR-0005](../../oficina-infra-k8s/docs/adr/0005-restricoes-aws-academy.md)) | `public_access_cidrs` e nós em subnet privada |
| `terraform plan` com credenciais AWS em `pull_request` | Plano em PR é parte do fluxo exigido | Environment protegido com aprovação para jobs com credencial |
