import { BusinessError, NotFoundError } from "../../../shared/errors";
import type { IOrdemRepository } from "../../../domain/repositories/ordens.repository.interface";

export class ReprovarOrcamentoUseCase {
  constructor(private readonly repo: IOrdemRepository) {}

  async execute(id: string, observacao?: string) {
    const os = await this.repo.buscarPorId(id);
    if (!os) throw new NotFoundError("Ordem de Serviço");
    if (os.status !== "AGUARDANDO_APROVACAO")
      throw new BusinessError('Apenas OS em "Aguardando Aprovação" podem ser reprovadas');

    await this.repo.reprovar({
      id,
      observacao,
      pecas: (os.pecas as { pecaId: string; quantidade: number }[]).map((p) => ({
        pecaId: p.pecaId,
        quantidade: p.quantidade,
      })),
    });

    const atualizada = await this.repo.buscarPorId(id);
    return atualizada!;
  }
}
