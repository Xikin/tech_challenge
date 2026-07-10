import type { StatusOS } from '../enums/status-os.enum';
import type { DecimalLike } from '../types/decimal-like';

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

export interface OrdemClienteResumo {
  id: string;
  nome: string;
  cpfCnpj: string;
  email: string | null;
  telefone: string | null;
}

export interface OrdemVeiculoDetalhe {
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
}

export interface ItemServicoOSRecord {
  id: string;
  ordemId: string;
  servicoId: string;
  preco: number | DecimalLike;
  tempoReal: number | null;
  servico: {
    id: string;
    nome: string;
    descricao: string | null;
    preco: number | DecimalLike;
    tempoPrevisto: number | null;
    ativo: boolean;
    criadoEm: Date;
    atualizadoEm: Date;
  };
}

export interface ItemPecaOSRecord {
  id: string;
  ordemId: string;
  pecaId: string;
  quantidade: number;
  preco: number | DecimalLike;
  peca: {
    id: string;
    nome: string;
    descricao: string | null;
    preco: number | DecimalLike;
    quantidade: number;
    estoqueMin: number;
    unidade: string;
    ativo: boolean;
    criadoEm: Date;
    atualizadoEm: Date;
  };
}

export interface HistoricoOSRecord {
  id: string;
  ordemId: string;
  statusAnterior: StatusOS | null;
  statusNovo: StatusOS;
  observacao: string | null;
  criadoEm: Date;
}

export interface OrdemRecord {
  id: string;
  numero: number;
  clienteId: string;
  veiculoId: string;
  status: StatusOS;
  descricao: string | null;
  observacoes: string | null;
  valorTotal: number | DecimalLike;
  aprovadoEm: Date | null;
  iniciadoEm: Date | null;
  finalizadoEm: Date | null;
  entregueEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
  cliente: OrdemClienteResumo;
  veiculo: OrdemVeiculoDetalhe;
  servicos: ItemServicoOSRecord[];
  pecas: ItemPecaOSRecord[];
  historico: HistoricoOSRecord[];
}

export interface OrdemListItem {
  id: string;
  numero: number;
  clienteId: string;
  veiculoId: string;
  status: StatusOS;
  descricao: string | null;
  observacoes: string | null;
  valorTotal: number | DecimalLike;
  aprovadoEm: Date | null;
  iniciadoEm: Date | null;
  finalizadoEm: Date | null;
  entregueEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
  cliente: { id: string; nome: string; cpfCnpj: string };
  veiculo: { id: string; placa: string; marca: string; modelo: string };
  _count: { servicos: number; pecas: number };
}

export interface OrdemStatusPublico {
  id: string;
  numero: number;
  status: StatusOS;
  valorTotal: number | DecimalLike;
  criadoEm: Date;
  aprovadoEm: Date | null;
  iniciadoEm: Date | null;
  finalizadoEm: Date | null;
  entregueEm: Date | null;
  veiculo: { placa: string; marca: string; modelo: string };
  servicos: { servico: { nome: string }; preco: number | DecimalLike }[];
  historico: { statusNovo: StatusOS; observacao: string | null; criadoEm: Date }[];
}

export interface IOrdemRepository {
  buscarPorId(id: string): Promise<OrdemRecord | null>;
  buscarPorNumero(numero: number): Promise<OrdemRecord | null>;
  buscarStatusPublico(numero: number, cpfCnpj: string): Promise<OrdemStatusPublico | null>;
  listar(params: ListarOrdensParams): Promise<{ data: OrdemListItem[]; total: number }>;
  criar(dados: CriarOrdemData): Promise<OrdemRecord>;
  atualizar(id: string, data: { descricao?: string; observacoes?: string }): Promise<OrdemRecord>;
  avancarStatus(dados: AvancarStatusData): Promise<void>;
  reprovar(dados: ReprovarOrdemData): Promise<void>;
  cancelar(dados: CancelarOrdemData): Promise<void>;
  adicionarItens(dados: AdicionarItensData): Promise<void>;
  buscarServico(id: string): Promise<{ id: string; preco: number | DecimalLike } | null>;
  buscarPeca(
    id: string,
  ): Promise<{ id: string; nome: string; preco: number | DecimalLike; quantidade: number } | null>;
  buscarCliente(id: string): Promise<{ id: string } | null>;
  buscarVeiculo(veiculoId: string, clienteId: string): Promise<{ id: string } | null>;
}
