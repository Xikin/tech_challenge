import type { StatusOS } from "@prisma/client";

export interface ListarOrdensParams {
  page: number;
  limit: number;
  status?: StatusOS;
  clienteId?: string;
  veiculoId?: string;
  dataInicio?: string;
  dataFim?: string;
}

export interface CriarOrdemData {
  clienteId: string;
  veiculoId: string;
  descricao?: string;
  observacoes?: string;
  valorTotal: number;
  servicos: { servicoId: string; preco: number }[];
  pecas: { pecaId: string; quantidade: number; preco: number }[];
}

export interface AvancarStatusData {
  id: string;
  statusAtual: StatusOS;
  novoStatus: StatusOS;
  observacao?: string;
  tempoReal?: number;
  qtdServicos: number;
  timestampExtra: object;
}

export interface ReprovarOrdemData {
  id: string;
  observacao?: string;
  pecas: { pecaId: string; quantidade: number }[];
}

export interface CancelarOrdemData {
  id: string;
  statusAnterior: StatusOS;
  motivo?: string;
  pecas: { pecaId: string; quantidade: number }[];
}

export interface AdicionarItensData {
  ordemId: string;
  servicos: { servicoId: string; preco: number }[];
  pecas: { pecaId: string; quantidade: number; preco: number }[];
  novoTotal: number;
}

export interface IOrdemRepository {
  buscarPorId(id: string): Promise<Record<string, unknown> | null>;
  buscarPorNumero(numero: number): Promise<Record<string, unknown> | null>;
  buscarStatusPublico(numero: number, cpfCnpj: string): Promise<Record<string, unknown> | null>;
  listar(params: ListarOrdensParams): Promise<{ data: Record<string, unknown>[]; total: number }>;
  criar(dados: CriarOrdemData): Promise<Record<string, unknown>>;
  atualizar(id: string, data: { descricao?: string; observacoes?: string }): Promise<Record<string, unknown>>;
  avancarStatus(dados: AvancarStatusData): Promise<void>;
  reprovar(dados: ReprovarOrdemData): Promise<void>;
  cancelar(dados: CancelarOrdemData): Promise<void>;
  adicionarItens(dados: AdicionarItensData): Promise<void>;
  buscarServico(id: string): Promise<{ id: string; preco: number | { toNumber(): number } } | null>;
  buscarPeca(id: string): Promise<{ id: string; nome: string; preco: number | { toNumber(): number }; quantidade: number } | null>;
  buscarCliente(id: string): Promise<{ id: string } | null>;
  buscarVeiculo(veiculoId: string, clienteId: string): Promise<{ id: string } | null>;
}
