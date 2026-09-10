import { BusinessError, NotFoundError } from '../../../shared/errors';
import { TRANSICOES, STATUS_LABEL, timestampsParaStatus } from './ordens.constants';
import type { IOrdemRepository } from '../../../domain/repositories/ordens.repository.interface';
import type { IEmailService } from '../../../domain/services/email.service.interface';
import { loggerSilencioso, type ILogger } from '../../../domain/services/logger.service.interface';

export interface AvancarStatusInput {
  observacao?: string;
  tempoReal?: number;
}

export class AvancarStatusUseCase {
  constructor(
    private readonly repo: IOrdemRepository,
    private readonly emailService: IEmailService,
    private readonly logger: ILogger = loggerSilencioso,
  ) {}

  async execute(id: string, input: AvancarStatusInput) {
    const os = await this.repo.buscarPorId(id);
    if (!os) throw new NotFoundError('Ordem de Serviço');

    const proximos = TRANSICOES[os.status];
    if (!proximos.length)
      throw new BusinessError(`OS "${STATUS_LABEL[os.status]}" não pode avançar`);

    const novoStatus = proximos[0];

    await this.repo.avancarStatus({
      id,
      statusAtual: os.status,
      novoStatus,
      observacao: input.observacao,
      tempoReal: input.tempoReal,
      qtdServicos: os.servicos.length,
      timestampExtra: timestampsParaStatus(novoStatus),
    });

    const cliente = os.cliente;
    if (cliente?.email) {
      // O e-mail é disparado sem await de propósito: a transição de status não
      // deve falhar porque o SMTP está fora do ar (ver ADR-0002). Mas a falha
      // precisa ser REGISTRADA — antes, o `.catch(() => {})` a engolia, e nenhum
      // alerta de "falha no processamento de ordens de serviço" seria possível
      // porque o sinal nunca era emitido.
      const promessa =
        novoStatus === 'AGUARDANDO_APROVACAO'
          ? this.emailService.enviarAprovacaoSolicitada({
              destinatario: cliente.email,
              nomeCliente: cliente.nome,
              numeroOS: os.numero,
              valorTotal: Number(os.valorTotal),
            })
          : this.emailService.enviarStatusAtualizado({
              destinatario: cliente.email,
              nomeCliente: cliente.nome,
              numeroOS: os.numero,
              statusAnterior: STATUS_LABEL[os.status],
              statusNovo: STATUS_LABEL[novoStatus],
              observacao: input.observacao,
            });

      promessa.catch((erro: unknown) => {
        this.logger.error(
          {
            evento: 'falha_integracao',
            integracao: 'email',
            operacao: 'notificar_mudanca_status',
            ordemId: id,
            numeroOS: os.numero,
            statusAnterior: os.status,
            statusNovo: novoStatus,
            erro: erro instanceof Error ? erro.message : String(erro),
          },
          'falha ao notificar cliente sobre mudança de status da OS',
        );
      });
    }

    const atualizada = await this.repo.buscarPorId(id);
    return atualizada!;
  }
}
