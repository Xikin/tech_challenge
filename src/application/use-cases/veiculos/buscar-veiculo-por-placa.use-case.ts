import { NotFoundError } from "../../../shared/errors";
import type { IVeiculoRepository } from "../../../domain/repositories/veiculos.repository.interface";

export class BuscarVeiculoPorPlacaUseCase {
  constructor(private readonly repo: IVeiculoRepository) {}

  async execute(placa: string) {
    const veiculo = await this.repo.buscarPorPlaca(placa);
    if (!veiculo) throw new NotFoundError("Veículo");
    return veiculo;
  }
}
