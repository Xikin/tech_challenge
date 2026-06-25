import { NotFoundError } from "../../../shared/errors";
import type { IServicoRepository } from "../../../domain/repositories/servicos.repository.interface";

export class BuscarServicoPorIdUseCase {
  constructor(private readonly repo: IServicoRepository) {}

  async execute(id: string) {
    const servico = await this.repo.buscarPorId(id);
    if (!servico) throw new NotFoundError("Serviço");
    return servico;
  }
}
