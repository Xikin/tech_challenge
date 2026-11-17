import { NotFoundError } from '../../../shared/errors';
import type { ISagaRepository } from '../../../domain/repositories/saga.repository.interface';

export class ConsultarSagaUseCase {
  constructor(private readonly sagas: ISagaRepository) {}

  async execute(ordemId: string) {
    const saga = await this.sagas.buscarComPassos(ordemId);
    if (!saga) throw new NotFoundError('Saga da Ordem de Serviço');
    return saga;
  }
}
