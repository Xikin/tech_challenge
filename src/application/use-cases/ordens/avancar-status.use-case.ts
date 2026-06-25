import { BusinessError, NotFoundError } from "../../../shared/errors";
import { TRANSICOES, STATUS_LABEL, TIMESTAMP_CAMPO } from "./ordens.constants";
import type { IOrdemRepository } from "../../../domain/repositories/ordens.repository.interface";
import type { IEmailService } from "../../../domain/services/email.service.interface";
import type { StatusOS } from "@prisma/client";

export interface AvancarStatusInput {
  observacao?: string;
  tempoReal?: number;
}

export class AvancarStatusUseCase {
  constructor(
    private readonly repo: IOrdemRepository,
    private readonly emailService: IEmailService,
  ) {}

  async execute(id: string, input: AvancarStatusInput) {
    const os = await this.repo.buscarPorId(id);
    if (!os) throw new NotFoundError("Ordem de Serviço");

    const proximos = TRANSICOES[os.status as StatusOS];
    if (!proximos.length) throw new BusinessError(`OS "${STATUS_LABEL[os.status as StatusOS]}" não pode avançar`);

    const novoStatus = proximos[0];

    await this.repo.avancarStatus({
      id,
      statusAtual: os.status as StatusOS,
      novoStatus,
      observacao: input.observacao,
      tempoReal: input.tempoReal,
      qtdServicos: (os.servicos as unknown[]).length,
      timestampExtra: TIMESTAMP_CAMPO[novoStatus] ?? {},
    });

    const cliente = os.cliente as { email?: string | null; nome: string } | null;
    if (cliente?.email) {
      if (novoStatus === "AGUARDANDO_APROVACAO") {
        this.emailService.enviarAprovacaoSolicitada({
          destinatario: cliente.email,
          nomeCliente: cliente.nome,
          numeroOS: os.numero as number,
          valorTotal: Number(os.valorTotal),
        }).catch(() => {});
      } else {
        this.emailService.enviarStatusAtualizado({
          destinatario: cliente.email,
          nomeCliente: cliente.nome,
          numeroOS: os.numero as number,
          statusAnterior: STATUS_LABEL[os.status as StatusOS],
          statusNovo: STATUS_LABEL[novoStatus],
          observacao: input.observacao,
        }).catch(() => {});
      }
    }

    const atualizada = await this.repo.buscarPorId(id);
    return atualizada!;
  }
}
