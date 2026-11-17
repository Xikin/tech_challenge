import { interpretarEvento } from './contratos';
import type { ExecutorDeSaga } from './executor-saga';
import { decidir } from '../../domain/saga/saga-os';
import {
  EventoPrematuroError,
  MensagemInvalidaError,
  type Mensagem,
} from '../../domain/mensageria/mensagem';
import type { IOrdemRepository } from '../../domain/repositories/ordens.repository.interface';
import type { ISagaRepository } from '../../domain/repositories/saga.repository.interface';
import type { ILogger } from '../../domain/services/logger.service.interface';

export const CONSUMIDOR_SAGA = 'os.saga';

export class ProcessarEventoSagaUseCase {
  constructor(
    private readonly ordens: IOrdemRepository,
    private readonly sagas: ISagaRepository,
    private readonly executor: ExecutorDeSaga,
    private readonly logger: ILogger,
  ) {}

  async execute(mensagem: Mensagem): Promise<void> {
    if (await this.sagas.jaProcessada(mensagem.id, CONSUMIDOR_SAGA)) {
      this.logger.info(
        {
          evento: 'mensagem_duplicada',
          mensagemId: mensagem.id,
          tipoMensagem: mensagem.tipo,
          ordemId: mensagem.ordemId,
        },
        'mensagem já processada; descartada',
      );
      return;
    }

    const evento = interpretarEvento(mensagem);

    const saga = await this.sagas.buscarPorOrdem(mensagem.ordemId);
    if (!saga) throw new MensagemInvalidaError(`Não existe saga para a OS ${mensagem.ordemId}`);
    if (saga.id !== mensagem.sagaId)
      throw new MensagemInvalidaError(
        `Mensagem da saga ${mensagem.sagaId} não pertence à saga ${saga.id} da OS`,
      );

    const ordem = await this.ordens.buscarPorId(mensagem.ordemId);
    if (!ordem) throw new MensagemInvalidaError(`OS ${mensagem.ordemId} não encontrada`);

    const decisao = decidir(saga, evento);
    if (decisao.prematura) {
      this.logger.info(
        {
          evento: 'saga_evento_adiado',
          sagaId: saga.id,
          ordemId: ordem.id,
          mensagemId: mensagem.id,
          tipoMensagem: mensagem.tipo,
          etapa: saga.etapa,
        },
        decisao.observacao,
      );
      throw new EventoPrematuroError(decisao.observacao);
    }

    await this.executor.aplicar(ordem, saga, decisao, {
      mensagemId: mensagem.id,
      tipo: mensagem.tipo,
      consumidor: CONSUMIDOR_SAGA,
    });
  }
}
