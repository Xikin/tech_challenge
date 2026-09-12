# ADR-0004: Autenticação stateless com JWT para usuários internos

**Status:** Aceita

## Contexto

Funcionários e administradores da oficina precisam autenticar e ter permissões diferenciadas (`ADMIN` vs `FUNCIONARIO`). Como a API roda em múltiplas réplicas atrás do HPA (ver [ADR-0003](0003-autoscaling-horizontal-hpa.md)), sessão com estado no servidor exigiria sticky sessions ou um store compartilhado (Redis), aumentando a complexidade operacional.

## Decisão

Login por e-mail/senha (`bcrypt`, `BCRYPT_ROUNDS` configurável) emite um JWT assinado (`@fastify/jwt`) contendo `sub` (id do usuário), `email` e `role`. Cada requisição a uma rota protegida envia o token via `Authorization: Bearer`, validado pelo middleware `autenticar()` ([`auth.middleware.ts`](../../src/presentation/http/middlewares/auth.middleware.ts)); `exigirRole(...)` restringe por papel. Não há tabela de sessões nem blacklist de tokens.

## Consequências

**Positivas:**
- Qualquer réplica valida o token sozinha, sem estado compartilhado — compatível com o autoscaling do ADR-0003.
- Sem infraestrutura adicional (Redis/sessão) para autenticação.

**Negativas:**
- Não é possível revogar um token antes da expiração sem uma lista de bloqueio adicional. Mitigado por expiração curta (`JWT_EXPIRES_IN=8h`).
- Comprometimento do `JWT_SECRET` invalida a confiança de todos os tokens emitidos — o secret vive só em Kubernetes Secret / GitHub Secrets, nunca no Git.

## Relacionado

A Fase 3 introduz um segundo emissor de JWT — a função serverless de autenticação por CPF para clientes finais (ver [RFC-0003](../rfc/0003-estrategia-de-autenticacao.md)). Ambos os emissores compartilham o mesmo `JWT_SECRET` e o mesmo middleware de validação; o que muda é quem emite e o `role` embutido no token.

> **Atualização (Fase 3):** com o segundo emissor, o `JWT_SECRET` deixou de ser o único
> segredo. Ver [ADR-0011](0011-segredos-jwt-por-emissor.md).
