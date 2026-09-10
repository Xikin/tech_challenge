# RFC-0002: Escolha do banco de dados gerenciado

**Status:** Implementada (2026-09-09) — RDS PostgreSQL provisionado em
`oficina-infra-db`. A justificativa formal do motor, o diagrama ER e a explicação
dos relacionamentos estão em [modelo-de-dados.md](../modelo-de-dados.md).

## Problema

A Fase 3 exige um banco de dados gerenciado (PostgreSQL, MySQL, SQL Server etc.) na nuvem, provisionado via Terraform em repositório próprio. Hoje o PostgreSQL roda como `Deployment` dentro do próprio cluster Kind ([`k8s/postgres-deployment.yaml`](../../k8s/postgres-deployment.yaml) + [`postgres-pvc.yaml`](../../k8s/postgres-pvc.yaml)) — sem backups automáticos, sem gerenciamento de patch, e competindo por recursos com a API no mesmo cluster.

## O que já está decidido

O motor continua sendo **PostgreSQL** — essa escolha já está formalizada no [README](../../README.md#por-que-postgresql) e não muda nesta RFC:

- Transações ACID garantem que a baixa de estoque de peças e a criação da OS aconteçam de forma atômica.
- Tipo `DECIMAL` evita erro de arredondamento em preços (vs. ponto flutuante).
- Numeração sequencial de OS sem duplicata, mesmo com múltiplas OS abertas simultaneamente.

O que esta RFC decide é **onde e como esse Postgres roda** na Fase 3.

## Alternativas consideradas

1. **Manter como Deployment no cluster** (atual) — não atende ao requisito de "banco de dados gerenciado"; descartada.
2. **Amazon RDS PostgreSQL** — gerenciado, backups automáticos diários, patching automático, Multi-AZ opcional para HA.
3. **Aurora PostgreSQL-compatible** — mais caro, com auto-scaling de storage e read replicas que não são necessários no volume atual de uma oficina.

## Recomendação

**Amazon RDS PostgreSQL**, instância `db.t3.micro` (free tier elegível — 750h/mês, 20GB), provisionada via Terraform em um repositório próprio (`oficina-infra-db`), separado do repositório de infraestrutura Kubernetes.

## Consequências

- `postgres-deployment.yaml`, `postgres-service.yaml` e `postgres-pvc.yaml` saem do repositório de aplicação/K8s — o cluster passa a hospedar só a API.
- `DATABASE_URL` passa a apontar para o endpoint do RDS, injetado via Kubernetes Secret (mesmo padrão já usado para `JWT_SECRET`, ver [`k8s/secret.example.yaml`](../../k8s/secret.example.yaml)).
- Backups e upgrades de versão do Postgres deixam de ser responsabilidade manual do time.

## Próximos passos — situação em 2026-09-09

1. ~~Provisionar RDS via Terraform.~~ **Feito** em `oficina-infra-db`. O Security
   Group ficou mais restrito do que o proposto: em vez de liberar a VPC inteira,
   o acesso é concedido por *security group de origem* — o SG dos nós do EKS e um
   SG "crachá" que a Lambda anexa. Nenhuma regra usa faixa de IP.
2. Migração de dados: não se aplica — não havia ambiente em uso.
3. ~~Atualizar o Secret do cluster.~~ **Feito**: o pipeline lê a `DATABASE_URL` do
   SSM (SecureString) e cria o Secret no deploy. A senha nunca é digitada nem
   versionada.

Além do previsto, foram adicionados um parameter group com
`log_min_duration_statement = 1000` (base do painel de queries lentas) e
Performance Insights.
