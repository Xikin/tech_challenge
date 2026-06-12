import { NotFoundError } from "../../../shared/errors";
import type { IServicoRepository } from "../../../domain/repositories/servicos.repository.interface";

export class CalcularTempoMedioUseCase {
  constructor(private readonly repo: IServicoRepository) {}

  async execute(id: string) {
    const servico = await this.repo.buscarPorId(id);
    if (!servico) throw new NotFoundError("Serviço");

    const itens = await this.repo.buscarTemposReais(id);
    if (!itens.length) return { tempoMedio: null, totalExecucoes: 0 };

    const soma = itens.reduce((acc, i) => acc + (i.tempoReal ?? 0), 0);
    return {
      tempoMedio: Math.round(soma / itens.length),
      totalExecucoes: itens.length,
    };
  }
}
