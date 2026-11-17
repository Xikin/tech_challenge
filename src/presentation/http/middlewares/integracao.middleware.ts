import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError, UnauthorizedError } from '../../../shared/errors';

export function exigirChaveDeIntegracao(chaveEsperada: string | undefined) {
  const esperada = chaveEsperada ? Buffer.from(chaveEsperada) : null;

  return async (req: FastifyRequest, _rep: FastifyReply) => {
    if (!esperada)
      throw new AppError('Integração entre serviços desabilitada', 503, 'INTEGRACAO_DESABILITADA');

    const recebida = req.headers['x-api-key'];
    const valor = Buffer.from(typeof recebida === 'string' ? recebida : '');
    if (valor.length !== esperada.length || !timingSafeEqual(valor, esperada)) {
      req.log.warn(
        { evento: 'acesso_negado', motivo: 'chave_de_integracao_invalida' },
        'chamada de integração com chave ausente ou inválida',
      );
      throw new UnauthorizedError('Chave de integração inválida');
    }
  };
}
