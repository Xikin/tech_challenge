import { randomUUID } from 'node:crypto';
import { BusinessError, NotFoundError } from '../../../shared/errors';
import { CANCELAVEIS_SEM_SAGA, STATUS_LABEL } from './ordens.constants';
import { CANCELAMENTO_SOLICITADO, decidir, podeCancelar } from '../../../domain/saga/saga-os';
import type { ExecutorDeSaga } from '../../saga/executor-saga';
import type { IOrdemRepository } from '../../../domain/repositories/ordens.repository.interface';
import type { ISagaRepository } from '../../../domain/repositories/saga.repository.interface';
import {
  chaveConsultaPublica,
  type ICache,
} from '../../../domain/services/cache.service.interface';

export class CancelarOrdemUseCase {
  constructor(
    private readonly ordens: IOrdemRepository,
    private readonly sagas: ISagaRepository,
    private readonly executor: ExecutorDeSaga,
    private readonly cache: ICache,
  ) {}

  async execute(id: string, motivo?: string) {
    const os = await this.ordens.buscarPorId(id);
    if (!os) throw new NotFoundError('Ordem de Serviço');

    const saga = await this.sagas.buscarPorOrdem(id);

    if (!saga) {
      if (!CANCELAVEIS_SEM_SAGA.includes(os.status))
        throw new BusinessError(
          `OS com status "${STATUS_LABEL[os.status]}" não pode ser cancelada.`,
        );
      await this.ordens.mudarStatus({
        id,
        statusAnterior: os.status,
        novoStatus: 'CANCELADA',
        observacao: motivo ?? 'Ordem de serviço cancelada',
      });
      await this.cache.remover(chaveConsultaPublica(os.numero));
      return { ordem: (await this.ordens.buscarPorId(id))!, compensacaoIniciada: false };
    }

    if (!podeCancelar(saga))
      throw new BusinessError(
        `OS com status "${STATUS_LABEL[os.status]}" não pode ser cancelada: a saga está ${saga.status.toLowerCase()} na etapa ${saga.etapa.toLowerCase()}.`,
      );

    await this.executor.aplicar(
      os,
      saga,
      decidir(saga, {
        tipo: CANCELAMENTO_SOLICITADO,
        motivo: motivo ?? 'Cancelada pela oficina',
      }),
      { mensagemId: randomUUID(), tipo: CANCELAMENTO_SOLICITADO, consumidor: null },
    );

    return { ordem: (await this.ordens.buscarPorId(id))!, compensacaoIniciada: true };
  }
}
