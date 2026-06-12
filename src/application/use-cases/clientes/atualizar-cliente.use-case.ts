import { NotFoundError } from "../../../shared/errors";
import type { IClienteRepository, AtualizarClienteData } from "../../../domain/repositories/clientes.repository.interface";

export class AtualizarClienteUseCase {
  constructor(private readonly repo: IClienteRepository) {}

  async execute(id: string, data: AtualizarClienteData) {
    const cliente = await this.repo.buscarPorId(id);
    if (!cliente) throw new NotFoundError("Cliente");
    return this.repo.atualizar(id, data);
  }
}
