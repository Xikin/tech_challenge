# RFCs — Request for Comments

Decisões técnicas relevantes da Fase 3 — nuvem, banco de dados gerenciado e
estratégia de autenticação. Formato: Problema → Alternativas → Recomendação →
Trade-offs.

As três foram aprovadas e implementadas. As decisões permanentes que derivaram
delas viraram [ADRs](../adr/README.md); onde a implementação divergiu da
recomendação original, o ADR diz por quê.

| RFC | Tema | Status |
| --- | --- | --- |
| [0001](0001-escolha-do-provedor-de-nuvem.md) | Escolha do provedor de nuvem | **Aceita** — AWS. A recomendação de k3s foi superada pelo [ADR-0007](../adr/README.md) |
| [0002](0002-escolha-do-banco-de-dados-gerenciado.md) | Escolha do banco de dados gerenciado | **Implementada** — RDS PostgreSQL, ver `oficina-infra-db` |
| [0003](0003-estrategia-de-autenticacao.md) | Estratégia de autenticação por CPF | **Implementada** — ver `oficina-auth-lambda` e [ADR-0008](../adr/0008-autorizacao-do-papel-cliente.md) |

Depois de aprovadas e implementadas, decisões permanentes derivadas destas RFCs viram [ADRs](../adr/README.md).
