import { NotFoundError } from '../../../shared/errors';
import type { IOrdemRepository } from '../../../domain/repositories/ordens.repository.interface';

export class BuscarOrdemPorIdUseCase {
  constructor(private readonly repo: IOrdemRepository) {}

  async execute(id: string) {
    const os = await this.repo.buscarPorId(id);
    if (!os) throw new NotFoundError('Ordem de Serviço');
    return os;
  }
}
