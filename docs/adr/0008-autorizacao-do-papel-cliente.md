# ADR-0008: Autorização do papel CLIENTE

**Status:** Aceita
**Data:** 2026-09-09
**Deriva de:** [RFC-0003](../rfc/0003-estrategia-de-autenticacao.md)
**Complementado por:** [ADR-0011](0011-segredos-jwt-por-emissor.md) — o segredo compartilhado descrito abaixo foi substituído por um segredo por emissor

## Contexto

A Fase 3 introduz autenticação do cliente final por CPF, numa função serverless que
emite um JWT assinado com o **mesmo `JWT_SECRET`** da API. A RFC-0003 afirmava que
"nenhuma mudança na validação de token é necessária, só um novo emissor".

Isso é verdade para `jwtVerify()` — e perigosamente falso para tudo o mais.

O middleware da Fase 2 tinha dois guards:

- `autenticar`: verifica a assinatura do token. **Não olha o papel.**
- `exigirRole(...)`: verifica o papel, mas era usado em apenas duas rotas
  (`/auth/usuarios`).

Todas as demais rotas usavam `autenticar`. Emitir um token com `role: CLIENTE` e
apontá-lo para essa API daria ao cliente acesso a:

- `GET /clientes` — a base inteira de clientes, com CPF de todo mundo
- `GET /ordens` — todas as ordens de serviço da oficina
- `PUT /ordens/:id` — alterar ordem de serviço de terceiros
- `PATCH /ordens/:id/avancar` — mover a OS de outro cliente na máquina de estados
- `/pecas`, `/servicos`, `/veiculos` — catálogo, estoque e frota completos

Ou seja: a funcionalidade pedida pelo enunciado, implementada de forma ingênua,
seria uma escalada de privilégio. A própria RFC-0003 reconhece o risco nos
trade-offs, sem resolvê-lo.

## Decisão

Trocar `autenticar` por dois guards explícitos e aplicar um deles em **toda** rota
protegida. Nenhuma rota volta a usar `autenticar` sozinho, exceto `/auth/me`, que
por definição devolve apenas os dados do próprio token.

### `exigirInterno`

Exige `role ∈ {ADMIN, FUNCIONARIO}`. Aplicado em todas as rotas administrativas:
listagens, escritas, catálogo, estoque e transições de status.

### `exigirDonoDoRecurso(extrairDonoId)`

Pessoal interno passa direto. Para `role: CLIENTE`, resolve quem é o dono do
recurso e compara com o `sub` do token.

Aplicado em três rotas de leitura:

| Rota | Dono |
| --- | --- |
| `GET /ordens/:id` | `ordem.cliente.id` |
| `GET /ordens/numero/:numero` | `ordem.cliente.id` |
| `GET /clientes/:id` | o próprio `:id` — o `sub` do token **é** o id do cliente |

**Recurso inexistente devolve 404, não 403.** Se o guard respondesse 403 para um id
que não existe, um cliente conseguiria descobrir quais ids existem pela diferença
entre as respostas. `extrairDonoId` devolvendo `null` deixa a rota seguir e
responder 404 no fluxo normal.

### O papel não entra no enum do banco

`CLIENTE` existe apenas no claim `role` do JWT. O enum `Role` do PostgreSQL
continua com `ADMIN` e `FUNCIONARIO`, porque cliente **não é linha em `usuarios`**:
não tem senha, não tem e-mail obrigatório, e seu cadastro vive em `clientes`.
Acrescentá-lo ao enum permitiria criar um `Usuario` com papel `CLIENTE` — estado
que nada no sistema saberia interpretar.

Em TypeScript isso vira dois tipos: `Role` (persistido) e
`RoleToken = Role | 'CLIENTE'`.

## Consequências

**Positivas**
- A autenticação por CPF deixa de ser um vetor de escalada de privilégio.
- O escopo do cliente é explícito no código e coberto por 22 testes de integração
  (`tests/integration/autorizacao.routes.test.ts`), incluindo o caso de acessar
  recurso de terceiro e o de não vazar existência.
- Uma rota nova sem guard falha ruidosamente: `exigirInterno` é o default óbvio.

**Negativas**
- `exigirDonoDoRecurso` faz uma consulta extra ao banco **antes** do handler, que
  vai buscar o mesmo registro de novo. São duas leituras por requisição nessas três
  rotas. Aceitável: são leituras indexadas por PK (e `ordens_servico(cliente_id)`
  ganhou índice nesta fase), e a alternativa — mover a autorização para dentro de
  cada caso de uso — espalharia a regra de segurança pela camada de aplicação.
- `GET /ordens` continua restrito ao pessoal interno. Um cliente não tem como
  listar as próprias ordens num único pedido; precisa consultar por id ou número.
  Resolver isso exige filtrar a listagem por `clienteId` a partir do token, o que
  muda o contrato do caso de uso — ficou fora do escopo desta fase.

**Neutras**
- `GET /ordens/consulta-publica` permanece sem autenticação, como na Fase 2
  (número da OS + CPF na querystring). Passar CPF em querystring o deixa em log de
  acesso do gateway; substituir essa rota pelo fluxo autenticado é a evolução
  natural, mas manteria compatibilidade quebrada com quem já a usa.

## Reavaliar se

O cliente ganhar mais funcionalidades (aprovar orçamento pelo app, por exemplo). A
partir de três ou quatro rotas com regra de dono, vale extrair um mecanismo de
políticas em vez de um guard por rota.
