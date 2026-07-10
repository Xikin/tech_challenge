# Arquitetura

---

## Camadas (Clean Architecture)

Desde a Fase 2, o código foi refatorado de uma organização por módulo (schema/repository/service/routes juntos) para camadas concêntricas com a regra de dependência apontando sempre para dentro — `domain` não importa nada de `application`, `infrastructure` ou `presentation`.

```
src/
├── domain/                        # Núcleo — sem dependência de framework ou ORM
│   ├── repositories/               <modulo>.repository.interface.ts (contratos)
│   ├── services/                   email.service.interface.ts, token.service.interface.ts
│   ├── enums/                      Role, TipoPessoa, StatusOS — tipos próprios, não importados do @prisma/client
│   └── types/                      DecimalLike — contrato estrutural para valores monetários (Prisma.Decimal ou number)
├── application/
│   └── use-cases/<modulo>/         Uma classe por caso de uso (CriarOrdemUseCase, AvancarStatusUseCase...)
├── infrastructure/                # Implementações concretas das interfaces do domain
│   ├── database/repositories/      Prisma<Modulo>Repository implements I<Modulo>Repository
│   └── services/                   NodemailerEmailService, FastifyTokenService
├── presentation/
│   └── http/
│       ├── routes/                 Handlers Fastify — só HTTP (status code, auth, chama o use case)
│       ├── schemas/                Validação e serialização com Zod
│       └── middlewares/            autenticar, exigirRole
└── shared/                        errors, utils, tipos cross-cutting
```

**Fluxo de uma requisição:** `Route (presentation) → Use Case (application) → Repository interface (domain) → Prisma Repository (infrastructure)`

A rota instancia o repositório concreto e injeta no use case pelo construtor (`new CriarOrdemUseCase(repo, emailService)`), mas o use case só conhece a interface (`IOrdemRepository`, `IEmailService`). Isso é o que permite os testes unitários em [`tests/unit/`](../tests/unit) rodarem os use cases com repositórios *mockados* via `vi.fn()`, sem subir banco de dados — só os testes de integração em [`tests/integration/`](../tests/integration) usam Postgres real.

| Camada             | Responsabilidade                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------ |
| **domain**           | Contratos (interfaces) de repositórios e serviços externos — nenhuma implementação aqui   |
| **application**      | Regras de negócio e orquestração, um caso de uso por ação (`criar-ordem.use-case.ts`, ...) |
| **infrastructure**   | Implementações concretas: Prisma para persistência, Nodemailer para e-mail, JWT para token |
| **presentation**     | HTTP puro: parsing/validação Zod, status codes, autenticação — delega tudo ao use case      |

---

## Módulos (bounded contexts)

Cada módulo replica a mesma estrutura de 4 camadas — por exemplo `ordens` tem `domain/repositories/ordens.repository.interface.ts`, `application/use-cases/ordens/*.use-case.ts`, `infrastructure/database/repositories/prisma-ordens.repository.ts` e `presentation/http/routes/ordens.routes.ts`.

| Módulo     | Bounded Context                | Casos de uso principais                                                              |
| ---------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| `auth`     | Autenticação e usuários         | Login, CriarUsuario, ListarUsuarios                                                    |
| `clientes` | Gestão de clientes (CPF/CNPJ)   | Criar, Listar, BuscarPorId, BuscarPorDocumento, Atualizar, Remover                      |
| `veiculos` | Gestão de veículos (placa)      | Criar, Listar, BuscarPorId, BuscarPorPlaca, Atualizar, Remover                          |
| `servicos` | Catálogo de serviços            | Criar, Listar, BuscarPorId, CalcularTempoMedio, Atualizar, Remover                      |
| `pecas`    | Peças e insumos (estoque)       | Criar, Listar, BuscarPorId, AlertasEstoque, Atualizar, AjustarEstoque, Remover          |
| `ordens`   | Ordem de Serviço (core domain)  | Criar, Listar, BuscarPorId/Numero, ConsultarStatusPublico, AdicionarItens, AvancarStatus, AprovarOrcamento, ReprovarOrcamento, Cancelar |

---

## Endpoints principais

### Autenticação

| Método | Rota             | Auth  |
| ------ | ---------------- | ----- |
| POST   | `/auth/login`    | ❌    |
| GET    | `/auth/me`       | ✅    |
| POST   | `/auth/usuarios` | ADMIN |

### Ordens de Serviço

| Método | Rota                       | Auth |
| ------ | -------------------------- | ---- |
| GET    | `/ordens/consulta-publica`      | ❌   |
| POST   | `/ordens`                       | ✅   |
| GET    | `/ordens`                       | ✅   |
| PATCH  | `/ordens/:id/avancar`           | ✅   |
| PATCH  | `/ordens/:id/aprovar-orcamento` | ✅   |
| PATCH  | `/ordens/:id/reprovar`          | ✅   |
| PATCH  | `/ordens/:id/cancelar`          | ✅   |

`PATCH /ordens/:id/aprovar-orcamento` é o endpoint de **aprovação de orçamento** que recebe a decisão do cliente (`aprovado: true|false`) — aprovando avança a OS para Em Execução, recusando devolve para Em Diagnóstico. Tanto ele quanto `PATCH /ordens/:id/avancar` disparam e-mail transacional para o cliente via `IEmailService` (ver [dominio.md](dominio.md)).

> Documentação completa e interativa: **http://localhost:3000/docs** · Collection Postman com todos os endpoints: [`postman/oficina-mvp.postman_collection.json`](../postman/oficina-mvp.postman_collection.json)

---

## Máquina de estados da OS

```
RECEBIDA → EM_DIAGNOSTICO → AGUARDANDO_APROVACAO → EM_EXECUCAO → FINALIZADA → ENTREGUE
                                    ↓ (reprovado)
                             EM_DIAGNOSTICO (peças devolvidas ao estoque)
```

Cada transição é registrada em `HistoricoOS` como trilha de auditoria imutável. Veja o significado de cada status em [dominio.md](dominio.md#ciclo-de-vida-da-os).
