import type {
  IOrdemRepository,
  ListarOrdensParams,
} from '../../../domain/repositories/ordens.repository.interface';

export class ListarOrdensUseCase {
  constructor(private readonly repo: IOrdemRepository) {}

  async execute(params: ListarOrdensParams) {
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
