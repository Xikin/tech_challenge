import { ConflictError } from '../../../shared/errors';
import type {
  IServicoRepository,
  CriarServicoData,
} from '../../../domain/repositories/servicos.repository.interface';

export class CriarServicoUseCase {
  constructor(private readonly repo: IServicoRepository) {}

  async execute(data: CriarServicoData) {
    if (await this.repo.buscarPorNome(data.nome))
      throw new ConflictError('Já existe um serviço com este nome');
    return this.repo.criar(data);
  }
}
