import type { IPecaRepository, ListarPecasParams } from "../../../domain/repositories/pecas.repository.interface";

export class ListarPecasUseCase {
  constructor(private readonly repo: IPecaRepository) {}

  async execute(params: ListarPecasParams) {
    const { data, total } = await this.repo.listar(params);
    const comAlerta = data.map((p) => ({ ...p, estoqueBaixo: p.quantidade <= p.estoqueMin }));
    return {
      data: comAlerta,
      meta: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }
}
