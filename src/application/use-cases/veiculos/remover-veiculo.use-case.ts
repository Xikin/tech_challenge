import { NotFoundError } from '../../../shared/errors';
import type { IVeiculoRepository } from '../../../domain/repositories/veiculos.repository.interface';

export class RemoverVeiculoUseCase {
  constructor(private readonly repo: IVeiculoRepository) {}

  async execute(id: string) {
    const veiculo = await this.repo.buscarPorId(id);
    if (!veiculo) throw new NotFoundError('Veículo');
    return this.repo.remover(id);
  }
}
