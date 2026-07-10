export type VeiculoRecord = {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
  ano: number;
  cor: string | null;
  clienteId: string;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
};

export type CriarVeiculoData = {
  placa: string;
  marca: string;
  modelo: string;
  ano: number;
  cor?: string;
  clienteId: string;
};

export type AtualizarVeiculoData = {
  placa?: string;
  marca?: string;
  modelo?: string;
  ano?: number;
  cor?: string;
};

export interface IVeiculoRepository {
  criar(data: CriarVeiculoData): Promise<VeiculoRecord & Record<string, unknown>>;
  buscarPorId(id: string): Promise<(VeiculoRecord & Record<string, unknown>) | null>;
  buscarPorPlaca(placa: string): Promise<(VeiculoRecord & Record<string, unknown>) | null>;
  buscarPorPlacaExata(placa: string): Promise<VeiculoRecord | null>;
  listar(clienteId?: string): Promise<(VeiculoRecord & Record<string, unknown>)[]>;
  atualizar(id: string, data: AtualizarVeiculoData): Promise<VeiculoRecord>;
  remover(id: string): Promise<VeiculoRecord>;
  clienteExiste(clienteId: string): Promise<unknown>;
}
