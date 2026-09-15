# Entrega — Tech Challenge Fase 3

Rascunho do documento a ser exportado como PDF único no Portal do Aluno.
**Preencha os campos marcados com `<...>` antes de exportar.**

---

## Identificação

| | |
| --- | --- |
| Turma | 13SOAT |
| Fase | 3 |
| Grupo | `<nomes e RMs dos integrantes>` |
| Nuvem | AWS (AWS Academy Learner Lab), região `us-east-1` |

---

## 1. Repositórios

| # | Repositório | URL | Conteúdo |
| --- | --- | --- | --- |
| 1 | Lambda (Function Serverless) | `https://github.com/<owner>/oficina-auth-lambda` | Autenticação por CPF + API Gateway |
| 2 | Infraestrutura Kubernetes (Terraform) | `https://github.com/<owner>/oficina-infra-k8s` | VPC + EKS + metrics-server |
| 3 | Infraestrutura do Banco (Terraform) | `https://github.com/<owner>/oficina-infra-db` | RDS PostgreSQL gerenciado |
| 4 | Aplicação principal em Kubernetes | `https://github.com/<owner>/tech_challenge` | API Fastify + manifestos K8s |

Todos com README próprio (propósito, tecnologias, passos de execução e deploy,
diagrama da arquitetura específica e link para Swagger/Postman), pipeline de CI/CD
funcional e Dockerfile onde aplicável.

**Usuário `soat-architecture` adicionado como colaborador nos 4 repositórios:**
`<confirmar — marcar após adicionar em Settings → Collaborators>`

---

## 2. Vídeo de demonstração

| | |
| --- | --- |
| URL | `<link do YouTube ou Vimeo, público ou não listado>` |
| Duração | `<máximo 15 minutos>` |

Roteiro sugerido (checklist dos 6 itens exigidos):

| # | Item exigido | Como demonstrar | ~min |
| --- | --- | --- | --- |
| 1 | **Autenticação com CPF** | `POST /auth/cpf` com CPF válido → 200 com JWT. Depois um CPF inválido → 422, um não cadastrado → 404, e um inativo → 403 | 3 |
| 2 | **Execução da pipeline CI/CD** | Abrir um PR: mostrar testes e o `terraform plan` comentado. Fazer merge e acompanhar o deploy | 3 |
| 3 | **Deploy automatizado** | Acompanhar o job de deploy: `kubectl rollout status`, o smoke test passando e o resumo do run | 2 |
| 4 | **Consumo das APIs protegidas** | Com o token do CPF, ler a própria OS (200) e tentar a de outro cliente (403). Com token de funcionário, listar todas (200) | 2 |
| 5 | **Dashboard de monitoramento ao vivo** | New Relic: volume diário de OS, tempo médio por status, erros de integração, CPU/memória do cluster. Gerar carga e mostrar o HPA subindo réplicas | 3 |
| 6 | **Logs e traces em execução** | Enviar um `x-request-id` conhecido e segui-lo do access log do gateway até a linha da aplicação. Mostrar um trace distribuído | 2 |

> Dica para o item 5: dispare uma falha de integração de propósito antes de gravar
> (ver `observabilidade/alertas.md`, seção final), para que o painel de erros tenha
> dados reais em vez de estar vazio.

---

## 3. Documentação

| Documento | Onde |
| --- | --- |
| Diagrama de componentes (nuvem, APIs, banco, monitoramento) | [`docs/arquitetura-nuvem.md`](arquitetura-nuvem.md#1-diagrama-de-componentes) |
| Diagrama de sequência — autenticação | [`docs/arquitetura-nuvem.md`](arquitetura-nuvem.md#2-diagrama-de-sequência--autenticação-por-cpf) |
| Diagrama de sequência — abertura de OS | [`docs/arquitetura-nuvem.md`](arquitetura-nuvem.md#3-diagrama-de-sequência--abertura-de-ordem-de-serviço) |
| Justificativa do banco + diagrama ER + relacionamentos | [`docs/modelo-de-dados.md`](modelo-de-dados.md) |
| RFCs (nuvem, banco, autenticação) | [`docs/rfc/`](rfc/README.md) |
| ADRs (12 nos 4 repositórios, 9 neste; incluindo HPA e padrão de comunicação) | [`docs/adr/`](adr/README.md) |
| Observabilidade (dashboards, consultas, alertas) | [`observabilidade/`](../observabilidade/) |
| Swagger / OpenAPI | `<API_GATEWAY_URL>/docs` e [`docs/openapi.json`](openapi.json) |
| Collection Postman | [`postman/`](../postman) |

---

## 4. Links dos ambientes ativos

Preencher após o deploy — saem do resumo de cada pipeline (*Summary* do run):

| Recurso | URL |
| --- | --- |
| API Gateway (entrada única) | `<https://xxxx.execute-api.us-east-1.amazonaws.com>` |
| Autenticação por CPF | `<API_GATEWAY_URL>/auth/cpf` |
| Swagger UI | `<API_GATEWAY_URL>/docs` |
| Dashboard New Relic | `<link do dashboard>` |

Obter por linha de comando:

```bash
cd oficina-auth-lambda/terraform && terraform output -raw api_gateway_url
```

> Se o cluster tiver sido destruído para poupar crédito, avise no documento que os
> ambientes são recriados sob demanda pelos pipelines — o vídeo permanece como
> evidência de funcionamento.

---

## 5. Requisitos obrigatórios — onde cada um foi atendido

### Autenticação e API Gateway

| Requisito | Atendido em |
| --- | --- |
| Implementar um API Gateway | AWS API Gateway HTTP API — `oficina-auth-lambda/terraform/api-gateway.tf` |
| Proteger rotas sensíveis com autenticação via CPF | `exigirInterno` e `exigirDonoDoRecurso` — `src/presentation/http/middlewares/auth.middleware.ts` |
| Function serverless: validar CPF | `src/cpf.ts` (dígito verificador, sem ramo de CNPJ) |
| Function serverless: consultar existência e status | `src/db.ts` — 404 para inexistente, 403 para inativo |
| Function serverless: gerar e devolver JWT | `src/token.ts` — `role: CLIENTE`, assinado com o segredo próprio do emissor de clientes ([ADR-0011](adr/0011-segredos-jwt-por-emissor.md)) |

### Estrutura de repositórios e CI/CD

| Requisito | Atendido em |
| --- | --- |
| 4 repositórios separados | tabela da seção 1 |
| CI/CD em cada um | 4 workflows do GitHub Actions |
| Deploy automático para a nuvem | jobs de deploy com credenciais AWS, `terraform apply` e `kubectl` |
| Branch main protegida | ruleset do GitHub — **passo manual, ver seção 6** |
| PRs obrigatórios para merge | mesma regra do ruleset |
| Deploy automático de homologação e produção | gatilhos em `homolog` e `main`, com states e ambientes separados |

### Infraestrutura obrigatória

| Requisito | Atendido em |
| --- | --- |
| API Gateway para controle e roteamento | HTTP API com throttling de 50 rps |
| Function serverless para autenticação | Lambda Node.js 20, bundle de 315 KB |
| Banco de dados gerenciado | Amazon RDS PostgreSQL 16, `db.t3.micro` |
| Cluster Kubernetes com escalabilidade | EKS 1.31, HPA de 2 a 10 pods + node group de 2 a 4 nós |
| Terraform para provisionamento | 3 stacks, backend S3 com versionamento e lock |

### Monitoramento e observabilidade

| Requisito | Atendido em |
| --- | --- |
| Integração com Datadog ou New Relic | New Relic — [ADR-0010](adr/0010-observabilidade-new-relic.md) |
| Latência das APIs | APM + access log do gateway |
| CPU e memória do Kubernetes | `nri-bundle` + metrics-server |
| Healthchecks e uptime | `/health`, `/health/ready` e synthetic check |
| Alertas para falhas no processamento de OS | condição sobre `evento = 'falha_integracao'` |
| Logs estruturados JSON com correlação | pino + `x-request-id` propagado por gateway, Lambda e API |
| Dashboard: volume diário de OS | evento `os_criada` |
| Dashboard: tempo médio por status | evento `os_status_alterado`, calculado de `historico_os` |
| Dashboard: erros e falhas nas integrações | `falha_integracao` e `erro_interno` |

### Documentação da arquitetura

| Requisito | Atendido em |
| --- | --- |
| Diagrama de componentes | `docs/arquitetura-nuvem.md` |
| Diagrama de sequência (autenticação e abertura de OS) | `docs/arquitetura-nuvem.md` |
| RFCs para decisões técnicas | 3 RFCs, todas com status atualizado |
| ADRs para decisões permanentes | 12 ADRs nos 4 repositórios (9 neste), incluindo HPA e padrão de comunicação |
| Justificativa do banco + ER + relacionamentos | `docs/modelo-de-dados.md` |
| Ajustes no modelo relacional | migration `20260909120000_indices_fase3` — 15 índices |

---

## 6. Passos manuais pendentes

Estes **não** podem ser feitos por código e precisam ser executados antes da
entrega:

- [ ] Criar os 3 repositórios vazios no GitHub e rodar `./publicar-repositorios.sh <owner>`
- [ ] Criar a branch `homolog` nos 4 repositórios
- [ ] **Proteger a branch `main` nos 4 repositórios** (requisito explícito)
- [ ] **Adicionar `soat-architecture` como colaborador nos 4 repositórios** (requisito explícito)
- [ ] Configurar os secrets em cada repositório
- [ ] Rodar `oficina-infra-k8s/bootstrap/backend.sh` uma vez
- [ ] Executar os deploys na ordem: infra-k8s → infra-db → oficina-mvp → auth-lambda
- [ ] Criar conta New Relic, instalar o `nri-bundle`, importar o dashboard e criar os alertas
- [ ] Rodar o seed no ambiente publicado (`npx prisma db seed` dentro de um pod da API) — cria os clientes de demonstração:
  - `529.982.247-25` Ana, ativa com e-mail → 200
  - `111.444.777-35` Bruno, ativo sem e-mail → 200, token sem claim `email`
  - `123.456.789-09` Carla, **inativa** → 403
  - Ana e Bruno têm uma OS cada, para mostrar 200 na própria e 403 na do outro
- [ ] Gravar o vídeo (até 15 min)
- [ ] Exportar este documento como PDF, com os `<...>` preenchidos

> A proteção de branch merece atenção: na verificação feita durante a Fase 3, a
> `main` de `Xikin/tech_challenge` **não estava protegida** — a API retornava
> `"protected": false` e nenhum ruleset. Um ruleset cujo `ref_name.include` está
> vazio aparece como ativo na interface, mas não protege ref nenhuma.
