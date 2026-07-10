import { NotFoundError, StockError } from '../../../shared/errors';
import type { IPecaRepository } from '../../../domain/repositories/pecas.repository.interface';

export interface AjustarEstoqueInput {
  quantidade: number;
}

export class AjustarEstoqueUseCase {
  constructor(private readonly repo: IPecaRepository) {}

  async execute(id: string, input: AjustarEstoqueInput) {
    const peca = await this.repo.buscarPorId(id);
    if (!peca) throw new NotFoundError('Peça');
    if (peca.quantidade + input.quantidade < 0)
      throw new StockError(`Estoque insuficiente. Disponível: ${peca.quantidade}`);
    return this.repo.incrementarEstoque(id, input.quantidade);
  }
}
