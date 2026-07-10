import { BusinessError, NotFoundError } from '../../../shared/errors';
import { CANCELAVEIS, STATUS_LABEL } from './ordens.constants';
import type { IOrdemRepository } from '../../../domain/repositories/ordens.repository.interface';

export class CancelarOrdemUseCase {
  constructor(private readonly repo: IOrdemRepository) {}

  async execute(id: string, motivo?: string) {
    const os = await this.repo.buscarPorId(id);
    if (!os) throw new NotFoundError('Ordem de Serviço');

    if (!CANCELAVEIS.includes(os.status))
      throw new BusinessError(
        `OS com status "${STATUS_LABEL[os.status]}" não pode ser cancelada. ` +
          'Apenas OS Recebida, Em Diagnóstico, Aguardando Aprovação ou Em Execução podem ser canceladas.',
      );

    await this.repo.cancelar({
      id,
      statusAnterior: os.status,
      motivo,
      pecas: os.pecas.map((p) => ({
        pecaId: p.pecaId,
        quantidade: p.quantidade,
      })),
    });

    const atualizada = await this.repo.buscarPorId(id);
    return atualizada!;
  }
}
