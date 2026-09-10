/**
 * Contrato de log para a camada de aplicação.
 *
 * Existe para que casos de uso possam registrar falhas de integração sem
 * importar Fastify ou pino — mesma razão de `IEmailService` e `ITokenService`.
 *
 * A implementação injetada nas rotas é o `req.log` do Fastify, que já é um
 * child logger com o `reqId` da requisição vinculado. Assim a linha emitida
 * aqui dentro correlaciona automaticamente com as linhas de entrada e saída
 * da mesma requisição — que é o que o requisito de "correlação entre
 * requisições" da Fase 3 pede.
 *
 * A assinatura (objeto primeiro, mensagem depois) é a do pino de propósito:
 * o `req.log` do Fastify satisfaz esta interface sem adaptador.
 */
export interface ILogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/** Usado em testes e onde não há requisição associada. */
export const loggerSilencioso: ILogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
