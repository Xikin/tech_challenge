/**
 * Papéis de usuário **persistidos** na tabela `usuarios`.
 *
 * São o pessoal interno da oficina, autenticado por e-mail e senha na própria
 * API (ver ADR-0004).
 */
export type Role = 'ADMIN' | 'FUNCIONARIO';

/**
 * Papéis que podem aparecer no claim `role` de um JWT.
 *
 * `CLIENTE` é o cliente final, autenticado por CPF na função serverless do
 * repositório oficina-auth-lambda. Note que CLIENTE **não** é um `Role`: não
 * existe linha em `usuarios` para um cliente, e o enum `Role` do banco continua
 * com dois valores. O papel só existe dentro do token.
 *
 * Esta API nunca emite token de CLIENTE — apenas o valida, e restringe o acesso
 * aos recursos do próprio cliente (ver `exigirDonoDoRecurso` e ADR-0008).
 */
export type RoleToken = Role | 'CLIENTE';

/** Papéis que representam pessoal interno da oficina. */
export const ROLES_INTERNOS: readonly RoleToken[] = ['ADMIN', 'FUNCIONARIO'];
