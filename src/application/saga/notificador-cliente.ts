import { STATUS_LABEL } from '../use-cases/ordens/ordens.constants';
import type { StatusOS } from '../../domain/enums/status-os.enum';
import type { OrdemRecord } from '../../domain/repositories/ordens.repository.interface';
import type { IEmailService } from '../../domain/services/email.service.interface';
import type { ILogger } from '../../domain/services/logger.service.interface';
import type { EfeitosNaOrdem } from '../../domain/saga/saga-os';

export interface MudancaNotificada {
  anterior: StatusOS;
  novo: StatusOS;
  observacao?: string;
}

export class NotificadorCliente {
  constructor(
    private readonly email: IEmailService,
    private readonly logger: ILogger,
  ) {}

  notificar(ordem: OrdemRecord, mudanca: MudancaNotificada, efeitos: EfeitosNaOrdem = {}): void {
    const cliente = ordem.cliente;
    if (!cliente?.email) return;

    const base = { destinatario: cliente.email, nomeCliente: cliente.nome, numeroOS: ordem.numero };
    const valorTotal = efeitos.valorTotal ?? Number(ordem.valorTotal);

    let envio: Promise<void>;
    if (mudanca.novo === 'AGUARDANDO_APROVACAO') {
      envio = this.email.enviarAprovacaoSolicitada({ ...base, valorTotal });
    } else if (mudanca.novo === 'AGUARDANDO_PAGAMENTO' && efeitos.linkPagamento) {
      envio = this.email.enviarPagamentoSolicitado({
        ...base,
        valorTotal,
        linkPagamento: efeitos.linkPagamento,
      });
    } else {
      envio = this.email.enviarStatusAtualizado({
        ...base,
        statusAnterior: STATUS_LABEL[mudanca.anterior],
        statusNovo: STATUS_LABEL[mudanca.novo],
        observacao: mudanca.observacao,
      });
    }

    envio.catch((erro: unknown) => {
      this.logger.error(
        {
          evento: 'falha_integracao',
          integracao: 'email',
          operacao: 'notificar_mudanca_status',
          ordemId: ordem.id,
          numeroOS: ordem.numero,
          statusAnterior: mudanca.anterior,
          statusNovo: mudanca.novo,
          erro: erro instanceof Error ? erro.message : String(erro),
        },
        'falha ao notificar cliente sobre mudança de status da OS',
      );
    });
  }
}
