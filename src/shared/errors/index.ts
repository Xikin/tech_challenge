export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = 'BAD_REQUEST',
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} não encontrado(a)`, 404, 'NOT_FOUND');
  }
}
export class ConflictError extends AppError {
  constructor(msg: string) {
    super(msg, 409, 'CONFLICT');
  }
}
export class UnauthorizedError extends AppError {
  constructor(msg = 'Não autorizado') {
    super(msg, 401, 'UNAUTHORIZED');
  }
}
export class ForbiddenError extends AppError {
  constructor(msg = 'Acesso negado') {
    super(msg, 403, 'FORBIDDEN');
  }
}
export class BusinessError extends AppError {
  constructor(msg: string) {
    super(msg, 400, 'BUSINESS_ERROR');
  }
}
export class StockError extends AppError {
  constructor(msg: string) {
    super(msg, 400, 'STOCK_ERROR');
  }
}

/**
 * Limite de tentativas excedido. Devolvido pelo `errorResponseBuilder` do
 * @fastify/rate-limit, que lança o objeto construído: sendo um AppError, o
 * setErrorHandler responde 429 no mesmo formato das demais falhas, em vez de
 * tratá-lo como erro interno.
 */
export class TooManyRequestsError extends AppError {
  constructor(msg: string) {
    super(msg, 429, 'RATE_LIMITED');
  }
}
