import { NotFoundError } from '../../../shared/errors';
import type { IClienteRepository } from '../../../domain/repositories/clientes.repository.interface';

export class RemoverClienteUseCase {
  constructor(private readonly repo: IClienteRepository) {}

  async execute(id: string) {
    const cliente = await this.repo.buscarPorId(id);
    if (!cliente) throw new NotFoundError('Cliente');
    return this.repo.remover(id);
  }
}
