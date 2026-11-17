# ADRs — Architecture Decision Records

Decisões arquiteturais permanentes já tomadas e refletidas no código. Formato: Contexto → Decisão → Consequências.

| ADR | Decisão | Status |
| --- | --- | --- |
| [0001](0001-clean-architecture-em-camadas.md) | Arquitetura em camadas (Clean Architecture) | Aceita |
| [0002](0002-comunicacao-sincrona-rest.md) | Comunicação síncrona via REST/HTTP | Substituída em parte pela 0014 |
| [0003](0003-autoscaling-horizontal-hpa.md) | Autoscaling horizontal via HPA | Aceita |
| [0004](0004-autenticacao-stateless-jwt.md) | Autenticação stateless com JWT (usuários internos) | Aceita |
| [0005](https://github.com/Xikin/oficina-infra-k8s/blob/main/docs/adr/0005-restricoes-aws-academy.md) | Restrições do AWS Academy (LabRole, credenciais de 4h, sem NAT) | Aceita |
| [0006](https://github.com/Xikin/oficina-auth-lambda/blob/main/docs/adr/0006-segredos-da-lambda.md) | Segredos injetados no deploy, não lidos em runtime | Aceita |
| [0007](https://github.com/Xikin/oficina-infra-k8s/blob/main/docs/adr/0007-eks-em-vez-de-k3s.md) | EKS gerenciado em vez de k3s de nó único | Aceita |
| [0008](0008-autorizacao-do-papel-cliente.md) | Autorização do papel CLIENTE | Aceita |
| [0009](0009-api-gateway-entrada-unica.md) | API Gateway como ponto único de entrada | Aceita |
| [0010](0010-observabilidade-new-relic.md) | New Relic como stack de observabilidade | Aceita |
| [0011](0011-segredos-jwt-por-emissor.md) | Um segredo JWT por emissor, com papel amarrado ao emissor | Aceita |
| [0012](0012-limites-de-tentativa.md) | Limites de tentativa por alvo e login em tempo constante | Aceita |
| [0013](0013-divisao-em-tres-microsservicos.md) | Divisão em três microsserviços com dono único de cada dado | Aceita |
| [0014](0014-saga-orquestrada-com-rabbitmq.md) | Saga orquestrada pelo OS Service sobre RabbitMQ | Aceita |
| [0015](0015-outbox-idempotencia-e-dlq.md) | Outbox transacional, consumidores idempotentes e fila de mortas | Aceita |
| [0016](0016-persistencia-poliglota.md) | PostgreSQL por serviço, MongoDB no Billing e Redis como cache | Aceita |
| [0017](0017-mercado-pago-checkout-pro.md) | Mercado Pago com Checkout Pro, webhook verificado e modo simulado | Aceita |

Os ADRs 0005, 0006 e 0007 vivem nos repositórios de infraestrutura, porque
descrevem decisões daquelas stacks — os links acima apontam para lá.

As ADRs 0013 a 0017 são da Fase 4 e valem para os três microsserviços; os repositórios
`oficina-execucao` e `oficina-billing` apontam para cá.

Para o contexto que originou as decisões da Fase 3, ver [RFCs](../rfc/README.md).
