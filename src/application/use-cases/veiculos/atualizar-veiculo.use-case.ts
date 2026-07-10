import { NotFoundError } from '../../../shared/errors';
import type {
  IVeiculoRepository,
  AtualizarVeiculoData,
} from '../../../domain/repositories/veiculos.repository.interface';

export class AtualizarVeiculoUseCase {
  constructor(private readonly repo: IVeiculoRepository) {}

  async execute(id: string, data: AtualizarVeiculoData) {
    const veiculo = await this.repo.buscarPorId(id);
    if (!veiculo) throw new NotFoundError('Veículo');
    return this.repo.atualizar(id, data);
  }
}
