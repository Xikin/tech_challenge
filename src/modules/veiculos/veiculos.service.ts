import { ConflictError, NotFoundError } from "../../shared/errors";
import { VeiculosRepository } from "./veiculos.repository";
import type { CriarVeiculoInput, AtualizarVeiculoInput } from "./veiculos.schema";

export class VeiculosService {
  constructor(private readonly repo: VeiculosRepository) {}

  async criar(data: CriarVeiculoInput) {
    const clienteExiste = await this.repo.clienteExiste(data.clienteId);
    if (!clienteExiste) throw new NotFoundError("Cliente");

    const placaExiste = await this.repo.buscarPorPlacaExata(data.placa);
    if (placaExiste) throw new ConflictError("Placa já cadastrada");

    return this.repo.criar(data);
  }

  async listar(clienteId?: string) {
    return this.repo.listar(clienteId);
  }

  async buscarPorId(id: string) {
    const veiculo = await this.repo.buscarPorId(id);
    if (!veiculo) throw new NotFoundError("Veículo");
    return veiculo;
  }

  async buscarPorPlaca(placa: string) {
    const veiculo = await this.repo.buscarPorPlaca(placa);
    if (!veiculo) throw new NotFoundError("Veículo");
    return veiculo;
  }

  async atualizar(id: string, data: AtualizarVeiculoInput) {
    await this.buscarPorId(id);
    return this.repo.atualizar(id, data);
  }

  async remover(id: string) {
    await this.buscarPorId(id);
    return this.repo.remover(id);
  }
}
