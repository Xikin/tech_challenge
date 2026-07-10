import { NotFoundError } from '../../../shared/errors';
import type { IClienteRepository } from '../../../domain/repositories/clientes.repository.interface';

export class BuscarClientePorDocumentoUseCase {
  constructor(private readonly repo: IClienteRepository) {}

  async execute(cpfCnpj: string) {
    const cliente = await this.repo.buscarPorCpfCnpj(cpfCnpj);
    if (!cliente || !(cliente as { ativo: boolean }).ativo) throw new NotFoundError('Cliente');
    return cliente;
  }
}
