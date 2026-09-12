# Arquitetura de nuvem — Fase 3

Visão da plataforma depois da migração para AWS: API Gateway como entrada única,
autenticação de cliente em função serverless, aplicação em EKS, banco gerenciado e
observabilidade em New Relic.

Para a arquitetura **interna** da aplicação (Clean Architecture, camadas, casos de
uso), ver [arquitetura.md](arquitetura.md). Para o modelo de dados, ver
[modelo-de-dados.md](modelo-de-dados.md).

---

## 1. Diagrama de componentes

```mermaid
flowchart TB
    cliente(["Cliente final<br/>CPF"])
    interno(["Funcionário / Admin<br/>e-mail + senha"])

    subgraph aws["AWS · us-east-1 · AWS Academy Learner Lab"]
        gw{{"API Gateway HTTP API<br/>ponto único de entrada<br/>throttling 50 rps"}}

        subgraph vpc["VPC 10.0.0.0/16"]
            subgraph pub["Subnets públicas · 2 AZs"]
                nlb["Network Load Balancer"]
                subgraph eks["Cluster EKS 1.31"]
                    pods["Deployment oficina-api<br/>2 a 10 réplicas"]
                    hpa["HPA<br/>CPU 70% / mem 80%"]
                    ms["metrics-server"]
                end
            end

            subgraph priv["Subnets privadas · 2 AZs · sem rota default"]
                lambda["Lambda oficina-auth<br/>Node.js 20"]
                rds[("RDS PostgreSQL 16<br/>db.t3.micro<br/>backup 7 dias")]
            end
        end

        ssm[("SSM Parameter Store<br/>contrato entre as stacks")]
        cw[("CloudWatch Logs<br/>+ X-Ray")]
    end

    nr[("New Relic<br/>APM · Infra · Logs<br/>Dashboards e Alertas")]
    ecr[("Amazon ECR<br/>oficina-prod-api")]

    cliente -->|"POST /auth/cpf"| gw
    cliente -->|"Bearer JWT"| gw
    interno -->|"POST /auth/login"| gw
    interno -->|"Bearer JWT"| gw

    gw -->|"rota pública"| lambda
    gw -->|"ANY /{proxy+}"| nlb
    nlb --> pods

    lambda -->|"5432"| rds
    pods -->|"5432"| rds

    ms -.->|"métricas"| hpa
    hpa -.->|"escala"| pods
    ecr -.->|"imagem<br/>pull pela role dos nós"| pods

    ssm -.-> lambda
    ssm -.-> pods
    lambda -.-> cw
    gw -.-> cw

    pods ==>|"APM, logs, traces"| nr
    eks ==>|"CPU, memória, eventos"| nr
    rds ==>|"métricas via integração AWS"| nr

    classDef entrada fill:#1f6feb,stroke:#0b3d91,color:#fff
    classDef dados fill:#6e40c9,stroke:#3b1e6e,color:#fff
    classDef obs fill:#1a7f37,stroke:#0d3d1c,color:#fff
    class gw entrada
    class rds,ssm dados
    class nr,cw obs
```

### Repositórios e o que cada um provisiona

| Repositório | Provisiona | Estado |
| --- | --- | --- |
| `oficina-infra-k8s` | VPC, subnets, IGW, EKS, node group, metrics-server | `infra-k8s/<env>/terraform.tfstate` |
| `oficina-infra-db` | RDS, subnet group, parameter group, security groups | `infra-db/<env>/terraform.tfstate` |
| `oficina-auth-lambda` | Lambda, API Gateway, rotas, integrações, log groups | `auth-lambda/<env>/terraform.tfstate` |
| `oficina-mvp` | Manifestos Kubernetes aplicados no cluster | — |

O acoplamento entre eles é apenas o SSM Parameter Store, sob `/oficina/<env>/`.
Nenhuma stack lê o state da outra.

```mermaid
flowchart LR
    k8s["oficina-infra-k8s"] -->|"vpc_id<br/>private_subnet_ids<br/>node_security_group_id"| ssm[("SSM")]
    ssm --> db["oficina-infra-db"]
    db -->|"database_url<br/>client_security_group_id"| ssm
    ssm --> app["oficina-mvp"]
    app -->|"api/endpoint"| ssm
    ssm --> fn["oficina-auth-lambda"]
```

Daí a ordem obrigatória de deploy:
`infra-k8s` → `infra-db` → `oficina-mvp` → `auth-lambda`.

---

## 2. Diagrama de sequência — autenticação por CPF

```mermaid
sequenceDiagram
    autonumber
    actor C as Cliente
    participant G as API Gateway
    participant L as Lambda oficina-auth
    participant D as RDS PostgreSQL
    participant A as API no EKS
    participant N as New Relic

    C->>G: POST /auth/cpf { cpf }
    activate G
    G->>G: gera requestId
    G->>L: invoke (payload 2.0, x-request-id)
    activate L

    Note over L: Passo 1 — dígito verificador
    alt CPF malformado
        L--)N: log warn (CPF mascarado)
        L-->>G: 422 CPF_INVALID
        G-->>C: 422
    end

    Note over L: Passo 2 — existência e status
    L->>D: SELECT id, nome, email, ativo FROM clientes<br/>WHERE cpf_cnpj = $1 AND tipo_pessoa = 'FISICA'
    activate D
    D-->>L: linha ou vazio
    deactivate D

    alt cliente inexistente
        L-->>G: 404 CLIENT_NOT_FOUND
        G-->>C: 404
    else cliente inativo
        L-->>G: 403 CLIENT_INACTIVE
        G-->>C: 403
    else banco inacessível
        L--)N: log error
        L-->>G: 503 AUTH_UNAVAILABLE
        G-->>C: 503
    end

    Note over L: Passo 3 — emite o token
    L->>L: jwt.sign({ sub, role: CLIENTE, cpf, nome })<br/>HS256, segredo do emissor de clientes
    L--)N: log info (clienteId, duracaoMs)
    L-->>G: 200 { token, expiresIn, cliente }
    deactivate L
    G-->>C: 200 + x-request-id
    deactivate G

    Note over C,A: A partir daqui, o token vale nas rotas protegidas

    C->>G: GET /ordens/{id}<br/>Authorization: Bearer <token>
    G->>A: proxy + x-request-id
    activate A
    A->>A: jwtVerify() — valida assinatura
    A->>D: SELECT ... FROM ordens_servico WHERE id = $1
    D-->>A: ordem
    A->>A: exigirDonoDoRecurso:<br/>ordem.cliente.id === token.sub ?
    alt OS de outro cliente
        A--)N: log warn acesso_negado
        A-->>C: 403
    else OS do próprio cliente
        A--)N: transação APM + log correlacionado
        A-->>C: 200 dados da OS
    end
    deactivate A
```

O ponto crítico é o passo final. Validar a assinatura do token **não basta**: sem
`exigirDonoDoRecurso`, um JWT de cliente legítimo daria acesso a qualquer OS.
Ver [ADR-0008](adr/0008-autorizacao-do-papel-cliente.md).

---

## 3. Diagrama de sequência — abertura de ordem de serviço

```mermaid
sequenceDiagram
    autonumber
    actor F as Funcionário
    participant G as API Gateway
    participant A as API no EKS
    participant UC as CriarOrdemUseCase
    participant R as PrismaOrdemRepository
    participant D as RDS PostgreSQL
    participant M as SMTP
    participant N as New Relic

    F->>G: POST /ordens<br/>{ clienteId, veiculoId, servicos[], pecas[] }
    G->>A: proxy + x-request-id
    activate A

    A->>A: exigirInterno — role ∈ {ADMIN, FUNCIONARIO}
    alt token de CLIENTE
        A-->>F: 403 rota restrita
    end

    A->>A: validação Zod do corpo
    alt corpo inválido
        A--)N: log warn erro_validacao
        A-->>F: 422 VALIDATION_ERROR
    end

    A->>UC: execute(dados)
    activate UC

    UC->>R: buscarCliente / buscarVeiculo
    R->>D: SELECT
    D-->>R: registros
    alt cliente ou veículo inexistente
        UC-->>A: NotFoundError
        A-->>F: 404
    end

    UC->>R: buscarPeca(id) para cada peça
    R->>D: SELECT
    D-->>R: estoque atual
    alt estoque insuficiente
        UC--)N: log warn erro_negocio
        UC-->>A: StockError
        A-->>F: 422 estoque insuficiente
    end

    Note over UC,D: Tudo abaixo em UMA transação
    UC->>R: criar(ordem, itens, novoTotal)
    activate R
    R->>D: BEGIN
    R->>D: INSERT ordens_servico (numero via sequence)
    R->>D: INSERT itens_servico_os / itens_peca_os
    R->>D: UPDATE pecas SET quantidade = quantidade - $1
    R->>D: INSERT historico_os (status_novo = RECEBIDA)
    R->>D: COMMIT
    Note right of D: Falha em qualquer passo → ROLLBACK.<br/>O estoque nunca baixa sem a OS existir.
    D-->>R: ok
    deactivate R

    UC-->>A: ordem criada
    deactivate UC

    A-->>F: 201 Created
    deactivate A

    Note over A,M: Notificação fora do caminho crítico
    A-)M: enviar e-mail ao cliente
    alt SMTP indisponível
        M--xA: erro
        A--)N: log error falha_integracao<br/>(alimenta o alerta de falhas)
    end
```

O e-mail é disparado **sem `await`** de propósito: a criação da OS não deve falhar
porque o servidor de e-mail está fora ([ADR-0002](adr/0002-comunicacao-sincrona-rest.md)).
Mas a falha é registrada — antes da Fase 3 ela era engolida por um
`.catch(() => {})`, e por isso nenhum alerta de "falha no processamento de ordens de
serviço" seria possível: o sinal nunca era emitido.

---

## 4. Fluxo de deploy

```mermaid
sequenceDiagram
    autonumber
    actor Dev
    participant GH as GitHub Actions
    participant ECR as Amazon ECR
    participant AWS as AWS (STS/SSM/EKS)
    participant K as Cluster EKS

    Dev->>GH: push em homolog ou main
    activate GH
    GH->>GH: format:check, prisma generate,<br/>migrate deploy, build, 137 testes
    GH->>GH: exporta docs/openapi.json

    GH->>AWS: sts get-caller-identity
    alt credenciais do Learner Lab expiradas
        AWS--xGH: erro
        GH-->>Dev: falha com instrução de renovar os secrets
    end

    GH->>AWS: ssm get-parameter (cluster_name, database_url)
    alt stack de infra ausente
        GH-->>Dev: falha indicando qual repositório aplicar antes
    end

    GH->>ECR: build e push da imagem (tag sha-<commit>)
    GH->>AWS: eks update-kubeconfig
    GH->>K: apply namespace, configmap, secret
    GH->>K: apply deployment, service, hpa
    K-->>GH: rollout status (maxUnavailable 0)
    K->>K: prisma migrate deploy no start do container

    GH->>K: aguarda hostname do NLB
    GH->>AWS: ssm put-parameter /oficina/<env>/api/endpoint
    Note right of AWS: fecha o contrato com o API Gateway

    GH->>K: smoke test — /health/ready = 200<br/>e /clientes sem token = 401
    GH-->>Dev: resumo com URL, Swagger e estado do cluster
    deactivate GH
```

---

## 5. Observabilidade

| Requisito da Fase 3 | Como é atendido |
| --- | --- |
| Latência das APIs | New Relic APM (agente Node) + métricas do API Gateway |
| CPU e memória do Kubernetes | New Relic Infrastructure (`nri-bundle`) + metrics-server |
| Healthchecks e uptime | `/health` (liveness) e `/health/ready` (readiness, com `SELECT 1`) + synthetic check do New Relic |
| Alertas de falha no processamento de OS | condição NRQL sobre `evento = 'falha_integracao'` e sobre `erro_interno` |
| Logs estruturados JSON | pino na API, JSON manual na Lambda, access log JSON no gateway |
| Correlação entre requisições | `x-request-id` propagado gateway → Lambda → API, presente em toda linha e devolvido em toda resposta |
| Volume diário de OS | dashboard NRQL sobre `historico_os` / transações |
| Tempo médio por status | dashboard NRQL, calculado de `historico_os.criado_em` |
| Erros e falhas nas integrações | dashboard NRQL sobre `evento = 'falha_integracao'` |

Consultas e alertas versionados em
[`observabilidade/`](../observabilidade/) — ver o README daquele diretório para
importar no New Relic.

---

## 6. Decisões registradas

| Documento | Assunto |
| --- | --- |
| [ADR-0005](https://github.com/Xikin/oficina-infra-k8s/blob/main/docs/adr/0005-restricoes-aws-academy.md) | Restrições do AWS Academy (LabRole, credenciais de 4h, sem NAT) |
| [ADR-0006](https://github.com/Xikin/oficina-auth-lambda/blob/main/docs/adr/0006-segredos-da-lambda.md) | Segredos injetados no deploy em vez de lidos em runtime |
| [ADR-0007](https://github.com/Xikin/oficina-infra-k8s/blob/main/docs/adr/0007-eks-em-vez-de-k3s.md) | EKS gerenciado em vez de k3s de nó único |
| [ADR-0008](adr/0008-autorizacao-do-papel-cliente.md) | Autorização do papel CLIENTE |
| [ADR-0009](adr/0009-api-gateway-entrada-unica.md) | API Gateway como ponto único de entrada |
| [ADR-0010](adr/0010-observabilidade-new-relic.md) | New Relic como stack de observabilidade |
| [ADR-0011](adr/0011-segredos-jwt-por-emissor.md) | Um segredo JWT por emissor, com papel amarrado ao emissor |
| [RFC-0001](rfc/0001-escolha-do-provedor-de-nuvem.md) | Escolha do provedor de nuvem |
| [RFC-0002](rfc/0002-escolha-do-banco-de-dados-gerenciado.md) | Escolha do banco gerenciado |
| [RFC-0003](rfc/0003-estrategia-de-autenticacao.md) | Estratégia de autenticação por CPF |
