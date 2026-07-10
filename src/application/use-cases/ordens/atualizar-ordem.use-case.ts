import { BusinessError, NotFoundError } from '../../../shared/errors';
import type { IOrdemRepository } from '../../../domain/repositories/ordens.repository.interface';

export interface AtualizarOrdemInput {
  descricao?: string;
  observacoes?: string;
}

export class AtualizarOrdemUseCase {
  constructor(private readonly repo: IOrdemRepository) {}

  async execute(id: string, data: AtualizarOrdemInput) {
    const os = await this.repo.buscarPorId(id);
    if (!os) throw new NotFoundError('Ordem de Serviço');
    if (['FINALIZADA', 'ENTREGUE', 'CANCELADA'].includes(os.status))
      throw new BusinessError('Não é possível editar uma OS finalizada, entregue ou cancelada');
    return this.repo.atualizar(id, data);
  }
}
