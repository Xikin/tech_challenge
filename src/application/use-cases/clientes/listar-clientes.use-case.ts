import type {
  IClienteRepository,
  ListarClientesParams,
} from '../../../domain/repositories/clientes.repository.interface';

export class ListarClientesUseCase {
  constructor(private readonly repo: IClienteRepository) {}

  async execute(params: ListarClientesParams) {
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
