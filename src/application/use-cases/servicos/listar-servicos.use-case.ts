import type { IServicoRepository, ListarServicosParams } from "../../../domain/repositories/servicos.repository.interface";

export class ListarServicosUseCase {
  constructor(private readonly repo: IServicoRepository) {}

  async execute(params: ListarServicosParams) {
    const { data, total } = await this.repo.listar(params);
    return {
      data,
      meta: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }
}
