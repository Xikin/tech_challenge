import { ConflictError, NotFoundError } from "../../../shared/errors";
import type { IPecaRepository, AtualizarPecaData } from "../../../domain/repositories/pecas.repository.interface";

export class AtualizarPecaUseCase {
  constructor(private readonly repo: IPecaRepository) {}

  async execute(id: string, data: AtualizarPecaData) {
    const peca = await this.repo.buscarPorId(id);
    if (!peca) throw new NotFoundError("Peça");
    if (data.nome && (await this.repo.buscarPorNome(data.nome, id)))
      throw new ConflictError("Já existe uma peça com este nome");
    return this.repo.atualizar(id, data);
  }
}
