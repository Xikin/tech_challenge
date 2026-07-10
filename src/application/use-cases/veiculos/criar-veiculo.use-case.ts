import { ConflictError, NotFoundError } from '../../../shared/errors';
import type {
  IVeiculoRepository,
  CriarVeiculoData,
} from '../../../domain/repositories/veiculos.repository.interface';

export class CriarVeiculoUseCase {
  constructor(private readonly repo: IVeiculoRepository) {}

  async execute(data: CriarVeiculoData) {
    const clienteExiste = await this.repo.clienteExiste(data.clienteId);
    if (!clienteExiste) throw new NotFoundError('Cliente');

    const placaExiste = await this.repo.buscarPorPlacaExata(data.placa);
    if (placaExiste) throw new ConflictError('Placa já cadastrada');

    return this.repo.criar(data);
  }
}
