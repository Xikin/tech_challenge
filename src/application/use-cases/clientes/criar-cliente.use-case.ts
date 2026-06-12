import { ConflictError } from "../../../shared/errors";
import type { IClienteRepository, CriarClienteData } from "../../../domain/repositories/clientes.repository.interface";

export class CriarClienteUseCase {
  constructor(private readonly repo: IClienteRepository) {}

  async execute(data: CriarClienteData) {
    const existe = await this.repo.buscarPorCpfCnpj(data.cpfCnpj);
    if (existe) throw new ConflictError("CPF/CNPJ já cadastrado");
    return this.repo.criar(data);
  }
}
