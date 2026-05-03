import { ConflictError, NotFoundError } from "../../shared/errors";
import { ClientesRepository } from "./clientes.repository";
import type {
  CriarClienteInput,
  AtualizarClienteInput,
  ListarClientesInput,
} from "./clientes.schema";

export class ClientesService {
  constructor(private readonly repo: ClientesRepository) {}

  async criar(data: CriarClienteInput) {
    const existe = await this.repo.buscarPorCpfCnpj(data.cpfCnpj);
    if (existe) throw new ConflictError("CPF/CNPJ já cadastrado");
    return this.repo.criar(data);
  }

  async listar(params: ListarClientesInput) {
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

  async buscarPorId(id: string) {
    const cliente = await this.repo.buscarPorId(id);
    if (!cliente) throw new NotFoundError("Cliente");
    return cliente;
  }

  async buscarPorCpfCnpj(cpfCnpj: string) {
    const cliente = await this.repo.buscarPorCpfCnpj(cpfCnpj);
    if (!cliente || !cliente.ativo) throw new NotFoundError("Cliente");
    return cliente;
  }

  async atualizar(id: string, data: AtualizarClienteInput) {
    await this.buscarPorId(id);
    return this.repo.atualizar(id, data);
  }

  async remover(id: string) {
    await this.buscarPorId(id);
    return this.repo.remover(id);
  }
}
