import { ConflictError } from '../../../shared/errors';
import type {
  IPecaRepository,
  CriarPecaData,
} from '../../../domain/repositories/pecas.repository.interface';

export class CriarPecaUseCase {
  constructor(private readonly repo: IPecaRepository) {}

  async execute(data: CriarPecaData) {
    if (await this.repo.buscarPorNome(data.nome))
      throw new ConflictError('Já existe uma peça com este nome');
    return this.repo.criar(data);
  }
}
