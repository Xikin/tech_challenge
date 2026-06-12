import { BusinessError, NotFoundError } from "../../../shared/errors";
import type { IServicoRepository } from "../../../domain/repositories/servicos.repository.interface";

export class RemoverServicoUseCase {
  constructor(private readonly repo: IServicoRepository) {}

  async execute(id: string) {
    const servico = await this.repo.buscarPorId(id);
    if (!servico) throw new NotFoundError("Serviço");
    if (await this.repo.buscarEmOSAtiva(id))
      throw new BusinessError("Serviço está em uso em uma OS ativa");
    return this.repo.remover(id);
  }
}
