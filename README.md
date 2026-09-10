# Oficina Mecânica

Sistema Integrado de Atendimento e Execução de Serviços.

## Fase 2 — Escalabilidade, qualidade e automação

A Fase 1 entregou a API funcional (clientes, veículos, ordens de serviço, peças). Esta fase evolui essa base para suportar produção real:

- **Clean Architecture**: código reorganizado em camadas `domain → application → infrastructure → presentation`, com um caso de uso por ação e repositórios acessados só por interface (ver [docs/arquitetura.md](docs/arquitetura.md)).
- **Testes automatizados**: unitários (use cases com repositórios mockados) e de integração (rotas HTTP com Postgres real) — cobertura atual **89,8%**.
- **Containerização e orquestração**: Docker/docker-compose para dev local e manifestos Kubernetes (Deployment, Service, ConfigMap, Secret, HPA) para produção.
- **Infraestrutura como código**: cluster Kubernetes local (Kind) provisionado via Terraform.
- **CI/CD**: pipeline no GitHub Actions que builda, testa, empacota a imagem Docker e faz deploy automático no cluster a cada push em `main`.
- **Notificação por e-mail**: cliente recebe e-mail a cada mudança de status da OS e quando o orçamento fica pronto para aprovação.

---

## Qualidade e Segurança

| Indicador                   | Resultado                       |
| --------------------------- | ------------------------------- |
| Quality Gate (SonarQube)    | ✅ PASSOU                       |
| Bugs                        | 0                               |
| Vulnerabilidades            | 0                               |
| Security Hotspots           | 0                               |
| Cobertura de testes         | 89,8%                           |


| CORS Misconfiguration (ZAP) | ✅ Corrigido (allowlist explícita via `ALLOWED_ORIGINS`) |
| SQL Injection / XSS / RCE   | ✅ Nenhuma encontrada           |

> Relatórios completos em [`reports/`](reports/) e [`docs/qualidade-seguranca.md`](docs/qualidade-seguranca.md)

---

## Stack

| Tecnologia     | Uso                           |
| -------------- | ----------------------------- |
| **Fastify**    | Framework HTTP                |
| **Prisma**     | ORM + migrations              |
| **PostgreSQL** | Banco de dados                |
| **Zod**        | Validação de schemas          |
| **JWT**        | Autenticação stateless        |
| **Vitest**     | Testes unitários e integração |
| **Docker**     | Containerização               |

### Por que PostgreSQL?

Uma oficina mecânica tem dados que se conectam naturalmente: o cliente tem veículos, cada veículo pode ter várias ordens de serviço, e cada OS reúne serviços e peças com os preços registrados no momento em que foram incluídos. Esse tipo de dado pede um banco relacional — e o PostgreSQL é a escolha mais sólida e confiável para isso.

Três pontos foram decisivos na escolha:

**Operações seguras.** Quando uma peça é adicionada numa OS, o estoque precisa ser descontado ao mesmo tempo. Se algo der errado no meio do caminho, o banco desfaz tudo automaticamente — sem deixar o estoque pela metade. O Prisma usa esse recurso do PostgreSQL para garantir que as coisas aconteçam de forma completa ou não aconteçam.

**Valores sem erro de arredondamento.** Preços de peças e serviços são guardados num formato numérico preciso (`DECIMAL`), não em ponto flutuante. Isso evita aqueles centavos a mais ou a menos que surgem quando se usa formatos inadequados para dinheiro.

**Numeração de OS sem duplicata.** Cada ordem de serviço recebe um número único e em ordem. O PostgreSQL garante isso de forma automática, mesmo que várias OSs sejam abertas ao mesmo tempo.

---

## Início rápido (Docker)

```bash
# 1. Configure o ambiente
cp .env.example .env

# 2. Suba os containers
docker compose up -d --build

# 3. Rode o seed
docker compose exec api npx prisma db seed

# 4. Acesse a documentação
open http://localhost:3000/docs
```

### Credenciais padrão (após seed)

| Role        | Email                   | Senha     |
| ----------- | ----------------------- | --------- |
| Admin       | admin@oficina.com       | Admin@123 |
| Funcionário | funcionario@oficina.com | Func@123  |

---

## Arquitetura e infraestrutura

```
Cliente HTTP
     │
     ▼
┌──────────────────────────────┐        ┌──────────────────────┐
│  oficina-api (Fastify)       │◄──────►│  PostgreSQL           │
│  domain → application →      │        │  (Deployment + PVC)   │
│  infrastructure/presentation │        └──────────────────────┘
│  2-10 réplicas via HPA       │
└──────────────────────────────┘
     ▲
     │ imagem publicada em cada push na main
┌──────────────────────────────┐
│  CI/CD (GitHub Actions)      │  build → test → docker build/push (GHCR) → deploy
└──────────────────────────────┘
     ▲
     │ provisiona o cluster antes do primeiro deploy
┌──────────────────────────────┐
│  Terraform (Kind + K8s)      │  cluster → namespace → secret
└──────────────────────────────┘
```

- **Componentes da aplicação**: API Fastify (camadas Clean Architecture, ver [docs/arquitetura.md](docs/arquitetura.md)) + PostgreSQL, ambos rodando como Deployments no namespace `oficina`.
- **Infraestrutura provisionada**: cluster Kubernetes (Kind) criado pelo Terraform ([docs/terraform.md](docs/terraform.md)); dentro dele, os manifestos em [`/k8s`](k8s) criam namespace, ConfigMap, Secret, PVC do Postgres, Deployments, Services e o HPA ([docs/kubernetes.md](docs/kubernetes.md)).
- **Fluxo de deploy**: push em `main` → pipeline roda testes → builda e publica a imagem no GHCR → aplica os manifestos K8s com a nova imagem, incluindo o Postgres e o HPA ([docs/cicd.md](docs/cicd.md)).

### Resumo — deploy e configuração de ambiente

| Etapa               | O que acontece                                              | Onde                        |
| -------------------- | ------------------------------------------------------------- | ---------------------------- |
| 1. Push/PR em `main` | Roda testes com Postgres efêmero                              | `job: test` no CI/CD          |
| 2. Build             | Builda a imagem Docker e publica no GHCR                      | `job: docker` no CI/CD        |
| 3. Deploy            | Aplica `/k8s` no cluster com a nova imagem (ConfigMap, Secret, Postgres, API, HPA) | `job: deploy` no CI/CD (runner self-hosted) |
| 4. Configuração      | Variáveis não-sensíveis no ConfigMap, credenciais no Secret, ambos consumidos pelo Deployment | [`k8s/configmap.yaml`](k8s/configmap.yaml), [`k8s/secret.example.yaml`](k8s/secret.example.yaml) |

Tabela completa de variáveis (nome, padrão, onde é definida em local/produção/CI) em [docs/desenvolvimento.md](docs/desenvolvimento.md#variáveis-de-ambiente).

### Deploy em Kubernetes

```bash
# 1. Provisiona o cluster local (Kind) com Terraform — ver docs/terraform.md
cd infra
cp terraform.tfvars.example terraform.tfvars   # preencha com valores reais
terraform init
terraform apply

# 2. Builda a imagem, carrega no cluster Kind e aplica os manifestos — ver docs/kubernetes.md
cd ..
docker build -t oficina:local --target runner .
./scripts/k8s-deploy.sh oficina:local oficina
```

O Terraform já cria o namespace `oficina` e o Secret `oficina-secret` (a partir do `terraform.tfvars`); o script `k8s-deploy.sh` carrega a imagem no cluster e aplica ConfigMap, Postgres, API e HPA. Em produção (CI/CD), esses mesmos manifestos são aplicados automaticamente pelo job `deploy` do [workflow](.github/workflows/ci-cd.yml) a cada push em `main`, usando a imagem publicada no GHCR em vez de uma imagem local.

---

## Testando a API

Collection completa do Postman (todos os endpoints, incluindo o fluxo de e-mail transacional da OS): [`postman/oficina-mvp.postman_collection.json`](postman/oficina-mvp.postman_collection.json). Importe no Postman e siga as instruções na descrição da collection.

Ou use a documentação interativa (Swagger) em `http://localhost:3000/docs` com a API rodando.

---

## Documentação

| Documento                                            | Descrição                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| [Domínio](docs/dominio.md)                           | Linguagem ubíqua, entidades, regras invariantes e ciclo de vida da OS |
| [Arquitetura](docs/arquitetura.md)                   | Camadas Clean Architecture, módulos, endpoints e máquina de estados   |
| [Desenvolvimento](docs/desenvolvimento.md)           | Execução local, testes, variáveis de ambiente e comandos úteis        |
| [Kubernetes](docs/kubernetes.md)                     | Manifestos, recursos do cluster e como aplicá-los                     |
| [Terraform](docs/terraform.md)                       | Provisionamento do cluster e do Secret via IaC                        |
| [CI/CD](docs/cicd.md)                                | Pipeline do GitHub Actions — jobs, triggers e segredos necessários    |
| [Qualidade e Segurança](docs/qualidade-seguranca.md) | SonarQube e OWASP ZAP                                                 |
| [ADRs](docs/adr/README.md)                           | Decisões arquiteturais permanentes já implementadas                   |
| [RFCs](docs/rfc/README.md)                           | Decisões técnicas da Fase 3 em discussão (nuvem, banco, autenticação) |
