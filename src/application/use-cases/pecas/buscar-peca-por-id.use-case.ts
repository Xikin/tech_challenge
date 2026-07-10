import { NotFoundError } from '../../../shared/errors';
import type { IPecaRepository } from '../../../domain/repositories/pecas.repository.interface';

export class BuscarPecaPorIdUseCase {
  constructor(private readonly repo: IPecaRepository) {}

  async execute(id: string) {
    const peca = await this.repo.buscarPorId(id);
    if (!peca) throw new NotFoundError('Peça');
    return peca;
  }
}
