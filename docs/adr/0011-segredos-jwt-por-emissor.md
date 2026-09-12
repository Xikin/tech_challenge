# ADR-0011: Um segredo JWT por emissor, com papel amarrado ao emissor

**Status:** Aceita
**Data:** 2026-09-12
**Substitui:** o trade-off de segredo compartilhado da [RFC-0003](../rfc/0003-estrategia-de-autenticacao.md)
**Complementa:** [ADR-0008](0008-autorizacao-do-papel-cliente.md)

## Contexto

A Fase 3 tem dois emissores de token: o login interno da API (ADMIN e
FUNCIONARIO) e a Lambda de autenticação por CPF (CLIENTE). A RFC-0003 aceitou que
os dois assinassem com o **mesmo** `JWT_SECRET`, sob o argumento de que "o
middleware só valida assinatura e claims, não a origem do token".

A revisão de segurança mostrou que esse era exatamente o problema. A API confiava
no claim `role` de qualquer token com assinatura válida, e o segredo precisava
existir em lugares muito mais expostos do que a própria API:

- na configuração da Lambda, legível por quem tem `lambda:GetFunctionConfiguration`
  — e a `LabRole` do AWS Academy concede isso amplamente;
- no state do Terraform em S3;
- nos secrets do GitHub do repositório da Lambda.

**Prova:** com o segredo compartilhado, assinei um token alegando `role: ADMIN` sem
usuário correspondente. Ele passou pela autorização de `GET /auth/usuarios` — a
resposta foi 500 (falha ao consultar o banco), não 401 nem 403.

Obter o segredo da Lambda equivalia a obter acesso administrativo à oficina.

## Decisão

**Cada emissor tem seu próprio segredo, e cada segredo só pode emitir um conjunto
fechado de papéis.**

| Emissor (`iss`) | Segredo | Onde existe | Papéis permitidos |
| --- | --- | --- | --- |
| `oficina-api` | `JWT_SECRET` | só na API | `ADMIN`, `FUNCIONARIO` |
| `oficina-auth-lambda` | `JWT_CLIENTE_SECRET` | API e Lambda | `CLIENTE` |

Implementação:

- A API registra o `@fastify/jwt` duas vezes: o registro padrão com `JWT_SECRET`
  e um namespace `cliente` com `JWT_CLIENTE_SECRET`.
- O middleware `autenticar` tenta verificar a assinatura com cada segredo. Quando
  uma assinatura confere, **exige** que `iss` e `role` sejam compatíveis com aquele
  emissor. Assinatura válida com claims incompatíveis é recusada com 401 e gera o
  evento `token_emissor_invalido` — não é token vencido nem malformado, é alguém
  usando um segredo que não deveria ter.
- O login interno passa a assinar com `iss: oficina-api`, explícito na chamada.
- A configuração da API **recusa subir** se os dois segredos forem iguais.
- A Lambda passa a ler `JWT_CLIENTE_SECRET`, e o nome do secret do GitHub e da
  variável Terraform acompanha a mudança. Nomes distintos são deliberados: com os
  dois lados chamando o segredo de `JWT_SECRET`, alguém acabaria copiando o segredo
  do login interno para a Lambda.

### Por que o `iss` é conferido em código

O `fast-jwt` oferece `allowedIss`, mas a versão em uso (dependência transitiva do
`@fastify/jwt` 8) tem uma vulnerabilidade crítica publicada **justamente na
validação desse claim**. A amarração não depende dele: a garantia vem de qual
segredo validou a assinatura, e o `iss` é comparado por igualdade de string no
middleware.

## Consequências

**Positivas**
- Vazar o segredo da Lambda permite, no pior caso, se passar por um cliente. Não
  permite mais forjar ADMIN nem FUNCIONARIO.
- O `JWT_SECRET` deixa de sair da API.
- Tentativas de forjar papel ficam visíveis num evento próprio, com alerta
  dedicado em `observabilidade/alertas.md`.
- 8 testes de integração cobrem a amarração, incluindo os cenários de ataque.

**Negativas**
- Mais um segredo para distribuir e rotacionar.
- Tokens emitidos antes da mudança (sem `iss`) deixam de valer imediatamente —
  aceitável, pois expiram em 8h de qualquer forma.

**Riscos que continuam**
- Quem obtiver `JWT_CLIENTE_SECRET` ainda consegue se passar por **qualquer**
  cliente, escolhendo o `sub`. Com HMAC, quem verifica também pode assinar.

## Evolução

Trocar HMAC por **par de chaves (RS256 ou ES256)**. A Lambda assina com a chave
privada, idealmente via KMS, e a API guarda só a chave pública. Assim, nem a
configuração da API nem o state dela permitem emitir tokens de cliente.
