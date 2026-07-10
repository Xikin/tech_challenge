import { BusinessError, NotFoundError } from '../../../shared/errors';
import { STATUS_LABEL, TIMESTAMP_CAMPO } from './ordens.constants';
import type { IOrdemRepository } from '../../../domain/repositories/ordens.repository.interface';
import type { IEmailService } from '../../../domain/services/email.service.interface';

export interface AprovarOrcamentoInput {
  aprovado: boolean;
  observacao?: string;
}

export class AprovarOrcamentoUseCase {
  constructor(
    private readonly repo: IOrdemRepository,
    private readonly emailService: IEmailService,
  ) {}

  async execute(id: string, input: AprovarOrcamentoInput) {
    const os = await this.repo.buscarPorId(id);
    if (!os) throw new NotFoundError('Ordem de Serviço');
    if (os.status !== 'AGUARDANDO_APROVACAO')
      throw new BusinessError(
        'Apenas OS em "Aguardando Aprovação" podem ter o orçamento processado',
      );

    if (input.aprovado) {
      await this.repo.avancarStatus({
        id,
        statusAtual: 'AGUARDANDO_APROVACAO',
        novoStatus: 'EM_EXECUCAO',
        observacao: input.observacao ?? 'Orçamento aprovado pelo cliente',
        qtdServicos: os.servicos.length,
        timestampExtra: TIMESTAMP_CAMPO['EM_EXECUCAO'] ?? {},
      });
    } else {
      await this.repo.reprovar({
        id,
        observacao: input.observacao ?? 'Cliente não aprovou o orçamento',
        pecas: os.pecas.map((p) => ({
          pecaId: p.pecaId,
          quantidade: p.quantidade,
        })),
      });
    }

    const atualizada = await this.repo.buscarPorId(id);
    const cliente = atualizada!.cliente;
    if (cliente?.email) {
      this.emailService
        .enviarStatusAtualizado({
          destinatario: cliente.email,
          nomeCliente: cliente.nome,
          numeroOS: atualizada!.numero,
          statusAnterior: STATUS_LABEL['AGUARDANDO_APROVACAO'],
          statusNovo: STATUS_LABEL[atualizada!.status],
          observacao: input.observacao,
        })
        .catch(() => {});
    }

    return atualizada!;
  }
}
