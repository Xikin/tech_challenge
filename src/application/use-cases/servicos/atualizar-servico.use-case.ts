import { ConflictError, NotFoundError } from '../../../shared/errors';
import type {
  IServicoRepository,
  AtualizarServicoData,
} from '../../../domain/repositories/servicos.repository.interface';

export class AtualizarServicoUseCase {
  constructor(private readonly repo: IServicoRepository) {}

  async execute(id: string, data: AtualizarServicoData) {
    const servico = await this.repo.buscarPorId(id);
    if (!servico) throw new NotFoundError('Serviço');
    if (data.nome && (await this.repo.buscarPorNome(data.nome, id)))
      throw new ConflictError('Já existe um serviço com este nome');
    return this.repo.atualizar(id, data);
  }
}
