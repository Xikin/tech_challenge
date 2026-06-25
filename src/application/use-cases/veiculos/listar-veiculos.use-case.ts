import type { IVeiculoRepository } from "../../../domain/repositories/veiculos.repository.interface";

export class ListarVeiculosUseCase {
  constructor(private readonly repo: IVeiculoRepository) {}

  async execute(clienteId?: string) {
    return this.repo.listar(clienteId);
  }
}
