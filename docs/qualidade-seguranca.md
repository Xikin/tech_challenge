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
