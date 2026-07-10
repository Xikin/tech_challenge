import type { IPecaRepository } from '../../../domain/repositories/pecas.repository.interface';

export class AlertasEstoqueUseCase {
  constructor(private readonly repo: IPecaRepository) {}

  async execute() {
    const todas = await this.repo.listarTodas();
    return todas
      .filter((p) => p.quantidade <= p.estoqueMin)
      .map((p) => ({ ...p, deficit: p.estoqueMin - p.quantidade }));
  }
}
