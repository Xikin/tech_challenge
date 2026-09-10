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

    // Evento de negócio para os painéis exigidos na Fase 3.
    //
    // A duração é calculada a partir de `historico_os`, e NÃO das colunas
    // aprovadoEm/iniciadoEm/finalizadoEm da própria OS: aquelas são um cache
    // mantido pela aplicação e podem divergir; `historico_os.criado_em` é
    // DEFAULT now() gerado pelo banco. Ver docs/modelo-de-dados.md, seção 6.
    //
    // O histórico vem ordenado por criadoEm ascendente, então o último item é
    // a transição mais recente — o momento em que a OS entrou no status atual.
    const entradaNoStatusAtual = os.historico.at(-1)?.criadoEm ?? os.criadoEm;
    this.logger.info(
      {
        evento: 'os_status_alterado',
        ordemId: id,
        numeroOS: os.numero,
        statusAnterior: os.status,
        statusNovo: novoStatus,
        duracaoNoStatusAnteriorMs: Date.now() - new Date(entradaNoStatusAtual).getTime(),
        valorTotal: Number(os.valorTotal),
      },
      'ordem de serviço avançou de status',
    );

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
