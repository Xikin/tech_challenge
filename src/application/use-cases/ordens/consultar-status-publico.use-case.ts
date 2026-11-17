import { createHash } from 'node:crypto';
import { NotFoundError } from '../../../shared/errors';
import { STATUS_LABEL } from './ordens.constants';
import type {
  IOrdemRepository,
  OrdemStatusPublico,
} from '../../../domain/repositories/ordens.repository.interface';
import {
  cacheDesligado,
  chaveConsultaPublica,
  type ICache,
} from '../../../domain/services/cache.service.interface';

export const TTL_CONSULTA_PUBLICA_SEGUNDOS = 60;

interface EntradaEmCache {
  documento: string;
  dados: OrdemStatusPublico;
}

const resumoDoDocumento = (cpfCnpj: string) =>
  createHash('sha256').update(cpfCnpj.replace(/\D/g, '')).digest('hex');

export class ConsultarStatusPublicoUseCase {
  constructor(
    private readonly repo: IOrdemRepository,
    private readonly cache: ICache = cacheDesligado,
  ) {}

  async execute(numero: number, cpfCnpj: string) {
    const chave = chaveConsultaPublica(numero);
    const documento = resumoDoDocumento(cpfCnpj);

    const emCache = await this.cache.obter<EntradaEmCache>(chave);
    if (emCache) {
      if (emCache.documento !== documento) throw new NotFoundError('Ordem de Serviço');
      return { ...emCache.dados, statusLabel: STATUS_LABEL[emCache.dados.status] };
    }

    const os = await this.repo.buscarStatusPublico(numero, cpfCnpj);
    if (!os) throw new NotFoundError('Ordem de Serviço');

    await this.cache.definir(chave, { documento, dados: os }, TTL_CONSULTA_PUBLICA_SEGUNDOS);
    return { ...os, statusLabel: STATUS_LABEL[os.status] };
  }
}
