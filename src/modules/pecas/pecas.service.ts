import { ConflictError, NotFoundError, StockError } from "../../shared/errors";
import { PecasRepository } from "./pecas.repository";
import type {
  CriarPecaInput,
  AtualizarPecaInput,
  AjustarEstoqueInput,
  ListarPecasInput,
} from "./pecas.schema";

export class PecasService {
  constructor(private readonly repo: PecasRepository) {}

  async criar(data: CriarPecaInput) {
    if (await this.repo.buscarPorNome(data.nome))
      throw new ConflictError("Já existe uma peça com este nome");
    return this.repo.criar(data);
  }

  async listar(params: ListarPecasInput) {
    const { data, total } = await this.repo.listar(params);
    const comAlerta = data.map((p) => ({
      ...p,
      estoqueBaixo: p.quantidade <= p.estoqueMin,
    }));
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

  async buscarPorId(id: string) {
    const peca = await this.repo.buscarPorId(id);
    if (!peca) throw new NotFoundError("Peça");
    return peca;
  }

  async atualizar(id: string, data: AtualizarPecaInput) {
    await this.buscarPorId(id);
    if (data.nome && (await this.repo.buscarPorNome(data.nome, id)))
      throw new ConflictError("Já existe uma peça com este nome");
    return this.repo.atualizar(id, data);
  }

  async ajustarEstoque(id: string, input: AjustarEstoqueInput) {
    const peca = await this.buscarPorId(id);
    if (peca.quantidade + input.quantidade < 0) {
      throw new StockError(`Estoque insuficiente. Disponível: ${peca.quantidade}`);
    }
    return this.repo.incrementarEstoque(id, input.quantidade);
  }

  async verificarDisponibilidade(pecaId: string, qtdNecessaria: number) {
    const peca = await this.buscarPorId(pecaId);
    if (peca.quantidade < qtdNecessaria) {
      throw new StockError(
        `Estoque insuficiente para "${peca.nome}". Disponível: ${peca.quantidade}`,
      );
    }
    return peca;
  }

  async alertasEstoque() {
    const todas = await this.repo.listarTodas();
    return todas
      .filter((p) => p.quantidade <= p.estoqueMin)
      .map((p) => ({ ...p, deficit: p.estoqueMin - p.quantidade }));
  }

  async remover(id: string) {
    await this.buscarPorId(id);
    return this.repo.remover(id);
  }
}
