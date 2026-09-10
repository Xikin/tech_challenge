# RFC-0003: Estratégia de autenticação por CPF

**Status:** Implementada (2026-09-09) — ver `oficina-auth-lambda`.

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

## Próximos passos — situação em 2026-09-09

1. ~~Implementar a Lambda.~~ **Feito** — `oficina-auth-lambda`, bundle de 315 KB,
   24 testes.
2. ~~Configurar `/auth/cpf` no API Gateway e o proxy das demais rotas.~~ **Feito**
   — ver [ADR-0009](../adr/0009-api-gateway-entrada-unica.md).
3. ~~Ajustar autorização para `CLIENTE`.~~ **Feito** — e foi maior do que esta RFC
   previa. Ver abaixo.

### Onde esta RFC subestimou o problema

A afirmação de que "nenhuma mudança na validação de token é necessária, só um novo
emissor" é verdadeira para `jwtVerify()` e **falsa para tudo o mais**:

- **Autorização.** `autenticar` não checava papel, e era o guard de quase todas as
  rotas. Um token de `CLIENTE` legítimo abriria `GET /clientes` (base inteira, com
  CPF de todos), `GET /ordens` e `PUT /ordens/:id`. Foi preciso criar
  `exigirInterno` e `exigirDonoDoRecurso` —
  [ADR-0008](../adr/0008-autorizacao-do-papel-cliente.md).
- **Tipos.** `TokenPayload` exigia `email: string`, mas `Cliente.email` é nullable.
  O claim passou a ser opcional.
- **Enum.** `CLIENTE` **não** foi adicionado ao enum `Role` do banco, porque
  cliente não é linha em `usuarios`. O papel existe só no token.

### Sobre o segredo compartilhado

O trade-off de dois emissores com o mesmo `JWT_SECRET` foi mantido, mas com uma
consequência operacional que vale registrar: se o segredo divergir entre a Lambda e
a API, o token é emitido com sucesso e **rejeitado silenciosamente** na primeira
rota protegida. É a falha mais difícil de diagnosticar no projeto, e por isso está
destacada nos READMEs dos dois repositórios.
