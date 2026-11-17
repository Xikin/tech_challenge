import { BusinessError, NotFoundError } from '../../../shared/errors';
import { STATUS_LABEL } from './ordens.constants';
import type { NotificadorCliente } from '../../saga/notificador-cliente';
import type { IOrdemRepository } from '../../../domain/repositories/ordens.repository.interface';
import {
  chaveConsultaPublica,
  type ICache,
} from '../../../domain/services/cache.service.interface';
import { loggerSilencioso, type ILogger } from '../../../domain/services/logger.service.interface';

export class EntregarOrdemUseCase {
  constructor(
    private readonly ordens: IOrdemRepository,
    private readonly notificador: NotificadorCliente,
    private readonly cache: ICache,
    private readonly logger: ILogger = loggerSilencioso,
  ) {}

  async execute(id: string, observacao?: string) {
    const os = await this.ordens.buscarPorId(id);
    if (!os) throw new NotFoundError('Ordem de Serviço');
    if (os.status !== 'FINALIZADA')
      throw new BusinessError(
        `Só é possível entregar OS finalizada; esta está "${STATUS_LABEL[os.status]}"`,
      );

    const mudanca = {
      anterior: os.status,
      novo: 'ENTREGUE' as const,
      observacao: observacao ?? 'Veículo entregue ao cliente',
    };
    await this.ordens.mudarStatus({
      id,
      statusAnterior: mudanca.anterior,
      novoStatus: mudanca.novo,
      observacao: mudanca.observacao,
    });
    await this.cache.remover(chaveConsultaPublica(os.numero));

    const entradaNoStatusAtual = os.historico.at(-1)?.criadoEm ?? os.criadoEm;
    this.logger.info(
      {
        evento: 'os_status_alterado',
        ordemId: os.id,
        numeroOS: os.numero,
        statusAnterior: mudanca.anterior,
        statusNovo: mudanca.novo,
        duracaoNoStatusAnteriorMs: Date.now() - new Date(entradaNoStatusAtual).getTime(),
        valorTotal: Number(os.valorTotal),
      },
      'ordem de serviço entregue',
    );
    this.notificador.notificar(os, mudanca);

    return (await this.ordens.buscarPorId(id))!;
  }
}
