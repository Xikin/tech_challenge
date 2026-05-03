import { ConflictError, NotFoundError, BusinessError } from "../../shared/errors";
import { ServicosRepository } from "./servicos.repository";
import type {
  CriarServicoInput,
  AtualizarServicoInput,
  ListarServicosInput,
} from "./servicos.schema";

export class ServicosService {
  constructor(private readonly repo: ServicosRepository) {}

  async criar(data: CriarServicoInput) {
    if (await this.repo.buscarPorNome(data.nome))
      throw new ConflictError("Já existe um serviço com este nome");
    return this.repo.criar(data);
  }

  async listar(params: ListarServicosInput) {
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
    const servico = await this.repo.buscarPorId(id);
    if (!servico) throw new NotFoundError("Serviço");
    return servico;
  }

  async atualizar(id: string, data: AtualizarServicoInput) {
    await this.buscarPorId(id);
    if (data.nome && (await this.repo.buscarPorNome(data.nome, id)))
      throw new ConflictError("Já existe um serviço com este nome");
    return this.repo.atualizar(id, data);
  }

  async remover(id: string) {
    await this.buscarPorId(id);
    if (await this.repo.buscarEmOSAtiva(id))
      throw new BusinessError("Serviço está em uso em uma OS ativa");
    return this.repo.remover(id);
  }

  async calcularTempoMedio(id: string) {
    await this.buscarPorId(id);
    const itens = await this.repo.buscarTemposReais(id);
    if (!itens.length) return { tempoMedio: null, totalExecucoes: 0 };
    const soma = itens.reduce((acc, i) => acc + (i.tempoReal ?? 0), 0);
    return {
      tempoMedio: Math.round(soma / itens.length),
      totalExecucoes: itens.length,
    };
  }
}
