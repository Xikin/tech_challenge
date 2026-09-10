# RFC-0003: Estratégia de autenticação por CPF

**Status:** Proposta

## Problema

A Fase 3 exige proteger rotas sensíveis com autenticação via CPF, através de uma função serverless que: valida o CPF, consulta existência e status do cliente na base, e devolve um JWT válido para consumo das APIs protegidas. Hoje a API só tem autenticação por e-mail/senha para usuários internos — funcionários e admins (ver [ADR-0004](../adr/0004-autenticacao-stateless-jwt.md)) — e não existe nenhum canal de autenticação para o cliente final da oficina.

## Proposta

Função serverless `oficina-auth-lambda` (repositório próprio), exposta via API Gateway em `POST /auth/cpf`:

1. **Validação de formato** — dígitos verificadores do CPF. Reaproveita a lógica já existente em [`shared/utils/validators.ts`](../../src/shared/utils/validators.ts).
2. **Consulta ao cliente** — busca no RDS PostgreSQL (ver [RFC-0002](0002-escolha-do-banco-de-dados-gerenciado.md)) pelo CPF, reaproveitando o padrão de [`buscar-cliente-por-documento.use-case.ts`](../../src/application/use-cases/clientes/buscar-cliente-por-documento.use-case.ts).
3. **Verificação de status** — cliente precisa existir e estar ativo; caso contrário, 401/404.
4. **Emissão do JWT** — assinado com o mesmo `JWT_SECRET` da API principal, contendo `sub` (id do cliente), `cpf` e `role: CLIENTE`. Formato compatível com o middleware `autenticar()` já existente na API — nenhuma mudança na validação de token é necessária, só um novo emissor.

```
Cliente → POST /auth/cpf (API Gateway) → Lambda
                                            │
                                            ├─ valida CPF
                                            ├─ consulta RDS
                                            └─ assina JWT (role: CLIENTE)
                                                    │
Cliente ← JWT ←─────────────────────────────────────┘
Cliente → GET /ordens/:id (Bearer JWT) → API Gateway → oficina-api (valida token, checa role)
```

## Alternativas consideradas

- **Validar CPF dentro da própria API Fastify** — mais simples de implementar, mas não atende ao requisito explícito de função serverless separada; descartada.
- **AWS Cognito com fluxo de autenticação customizado** — resolveria o problema, mas adiciona complexidade (User Pools, Lambda triggers) desproporcional a uma validação de CPF + status; descartada para o escopo atual.

## Trade-offs aceitos

- Dois emissores de JWT (login interno e Lambda de CPF) compartilhando o mesmo `JWT_SECRET`. Aceitável porque o middleware da API só valida assinatura e claims, não a origem do token — mas exige que o secret seja gerenciado com o mesmo cuidado nos dois repositórios (Kubernetes Secret e variável de ambiente da Lambda).
- O `role: CLIENTE` precisa de escopo restrito nas rotas (ex.: só visualizar as próprias ordens de serviço) — as rotas atuais foram desenhadas para `ADMIN`/`FUNCIONARIO` e precisam de revisão de autorização, não só de autenticação.

## Próximos passos

1. Implementar a Lambda com os três passos acima.
2. Configurar a rota `/auth/cpf` no API Gateway (pública) e o proxy das demais rotas sensíveis para o cluster (autenticadas).
3. Ajustar `exigirRole`/rotas de consulta pública de OS para aceitar `CLIENTE`, restringindo ao próprio recurso.
