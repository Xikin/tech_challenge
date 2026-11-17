import { NotFoundError } from '../../../shared/errors';
import { limparDocumento } from '../../../shared/utils/validators';
import type { IClienteRepository } from '../../../domain/repositories/clientes.repository.interface';

export class IdentificarClientePorCpfUseCase {
  constructor(private readonly repo: IClienteRepository) {}

  async execute(cpf: string) {
    const cliente = await this.repo.buscarPorCpfCnpj(limparDocumento(cpf));
    if (!cliente || cliente.tipoPessoa !== 'FISICA') throw new NotFoundError('Cliente');
    return { id: cliente.id, nome: cliente.nome, email: cliente.email, ativo: cliente.ativo };
  }
}
