/**
 * Emissores de token reconhecidos pela API (claim `iss`).
 *
 * Cada emissor tem segredo próprio e só pode emitir um conjunto fechado de
 * papéis (ver ADR-0011):
 *
 *   EMISSOR_INTERNO  (JWT_SECRET)          -> ADMIN, FUNCIONARIO
 *   EMISSOR_CLIENTE  (JWT_CLIENTE_SECRET)  -> CLIENTE
 *
 * O valor de EMISSOR_CLIENTE precisa ser idêntico ao `issuer` usado pela Lambda
 * em oficina-auth-lambda/src/token.ts.
 */
export const EMISSOR_INTERNO = 'oficina-api';
export const EMISSOR_CLIENTE = 'oficina-auth-lambda';
