import { NotFoundError } from "../../../shared/errors";
import type { IOrdemRepository } from "../../../domain/repositories/ordens.repository.interface";

export class BuscarOrdemPorNumeroUseCase {
  constructor(private readonly repo: IOrdemRepository) {}

  async execute(numero: number) {
    const os = await this.repo.buscarPorNumero(numero);
    if (!os) throw new NotFoundError("Ordem de Serviço");
    return os;
  }
}
