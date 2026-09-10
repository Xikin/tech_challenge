# RFC-0001: Escolha do provedor de nuvem

**Status:** Aceita (2026-09-09) — AWS confirmada.
**Ressalva:** a recomendação de k3s em EC2 desta RFC foi **superada** pelo
[ADR-0007](../adr/README.md), que adota EKS gerenciado. Ver a seção "Próximos
passos" ao final.

## Problema

A Fase 3 exige infraestrutura real na nuvem: API Gateway, função serverless para autenticação, banco de dados gerenciado e cluster Kubernetes com escalabilidade, tudo provisionado via Terraform e com deploy automático. Hoje tudo roda localmente — cluster Kind no Docker da máquina de desenvolvimento, runner do GitHub Actions self-hosted na própria máquina, PostgreSQL como Deployment dentro do cluster.

## Alternativas consideradas

| Critério | AWS | Azure | GCP |
| --- | --- | --- | --- |
| Serverless | Lambda | Functions | Cloud Functions |
| API Gateway nativo | API Gateway | API Management | API Gateway |
| K8s gerenciado | EKS (~US$0,10/h só o control plane) | AKS (control plane grátis) | GKE Autopilot (paga por pod) |
| Banco gerenciado | RDS PostgreSQL (free tier: db.t3.micro, 750h/mês) | Azure Database for PostgreSQL | Cloud SQL |
| Alinhamento com o edital | Repositório 1 é literalmente nomeado "Lambda" no enunciado | — | — |

## Recomendação

**AWS**, por dois motivos:

1. O próprio edital nomeia o repositório da função serverless como "Lambda", o que sugere AWS como referência do desafio (a escolha é livre, mas evita fricção desnecessária).
2. Free tier cobre Lambda (1M requisições/mês) e API Gateway de forma generosa para o volume de um projeto acadêmico.

Para o cluster Kubernetes, propomos **não usar EKS** (custo fixo de control plane) e sim **k3s provisionado via Terraform num único EC2** (ex.: `t3.small`) — o mesmo padrão de "Terraform cria o cluster" que já usamos com Kind localmente ([`infra/main.tf`](../../infra/main.tf)), só trocando o provider de `kind` para `aws` + um provisionamento remoto do k3s. Mantém a escalabilidade horizontal via HPA (ver [ADR-0003](../adr/0003-autoscaling-horizontal-hpa.md)) dentro do nó, sem o custo recorrente do control plane gerenciado.

## Trade-offs aceitos

- Cluster self-managed em EC2 não tem os SLAs, upgrades automáticos e integração nativa de IAM que o EKS oferece.
- Um único nó é um ponto único de falha de infraestrutura (diferente das réplicas de pod, que já são HA) — aceitável para o escopo do desafio; multi-nó fica como evolução futura se necessário.

## Próximos passos — situação em 2026-09-09

1. ~~Aprovação do grupo sobre a escolha de AWS.~~ **Feito.**
2. ~~Criar conta AWS dedicada.~~ **Feito** — AWS Academy Learner Lab, com as
   restrições registradas no
   [ADR-0005](../../../oficina-infra-k8s/docs/adr/0005-restricoes-aws-academy.md).
3. ~~Trocar o provider Terraform de `kind` para `aws`.~~ **Feito** em
   `oficina-infra-k8s`.

### Por que a recomendação de k3s foi abandonada

Ao detalhar a implementação, três problemas apareceram:

- **Não atende ao requisito.** O enunciado pede "Cluster Kubernetes com
  escalabilidade". Num nó único, o HPA escala pods só até saturar 2 vCPU — o
  `maxReplicas: 10` é inatingível, e nada escala a capacidade que os hospeda.
- **Ponto único de falha**, como esta própria RFC admite nos trade-offs.
- **Enfraquece o argumento de IaC**, porque k3s exige provisionamento imperativo
  via `user_data`/`remote-exec`.

O custo — único argumento a favor — mostrou-se administrável: ~US$2,40/dia de
control plane, com `terraform destroy` entre sessões de estudo. A decisão final
está no [ADR-0007](../adr/README.md).
