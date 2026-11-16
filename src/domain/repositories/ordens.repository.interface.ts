import type { StatusOS } from '../enums/status-os.enum';
import type { DecimalLike } from '../types/decimal-like';
import type { MensagemSaida } from '../mensageria/mensagem';
import type { EstadoSaga } from '../saga/saga-os';

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
}

export interface InicioSaga {
  estado: EstadoSaga;
  observacao: string;
  montarMensagens(ordem: OrdemRecord, sagaId: string): MensagemSaida[];
}

export interface MudancaDeStatusData {
  id: string;
  statusAnterior: StatusOS;
  novoStatus: StatusOS;
  observacao?: string;
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

export interface ItemOSRecord {
  id: string;
  ordemId: string;
  tipo: 'SERVICO' | 'PECA';
  referenciaId: string;
  nome: string;
  quantidade: number;
  precoUnitario: number | DecimalLike;
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
  orcamentoId: string | null;
  linkPagamento: string | null;
  aprovadoEm: Date | null;
  pagoEm: Date | null;
  iniciadoEm: Date | null;
  finalizadoEm: Date | null;
  entregueEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
  cliente: OrdemClienteResumo;
  veiculo: OrdemVeiculoDetalhe;
  itens: ItemOSRecord[];
  historico: HistoricoOSRecord[];
  saga: SagaResumo | null;
}

export interface SagaResumo {
  id: string;
  etapa: EstadoSaga['etapa'];
  status: EstadoSaga['status'];
  motivoFalha: string | null;
  compensacoesPendentes: string[];
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
  pagoEm: Date | null;
  iniciadoEm: Date | null;
  finalizadoEm: Date | null;
  entregueEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
  cliente: { id: string; nome: string; cpfCnpj: string };
  veiculo: { id: string; placa: string; marca: string; modelo: string };
  _count: { itens: number };
}

export interface OrdemStatusPublico {
  id: string;
  numero: number;
  status: StatusOS;
  valorTotal: number | DecimalLike;
  linkPagamento: string | null;
  criadoEm: Date;
  aprovadoEm: Date | null;
  pagoEm: Date | null;
  iniciadoEm: Date | null;
  finalizadoEm: Date | null;
  entregueEm: Date | null;
  veiculo: { placa: string; marca: string; modelo: string };
  itens: {
    tipo: 'SERVICO' | 'PECA';
    nome: string;
    quantidade: number;
    precoUnitario: number | DecimalLike;
  }[];
  historico: { statusNovo: StatusOS; observacao: string | null; criadoEm: Date }[];
}

export interface IOrdemRepository {
  buscarPorId(id: string): Promise<OrdemRecord | null>;
  buscarPorNumero(numero: number): Promise<OrdemRecord | null>;
  buscarStatusPublico(numero: number, cpfCnpj: string): Promise<OrdemStatusPublico | null>;
  listar(params: ListarOrdensParams): Promise<{ data: OrdemListItem[]; total: number }>;
  criarComSaga(dados: CriarOrdemData, saga: InicioSaga): Promise<OrdemRecord>;
  atualizar(id: string, data: { descricao?: string; observacoes?: string }): Promise<OrdemRecord>;
  mudarStatus(dados: MudancaDeStatusData): Promise<void>;
  buscarCliente(id: string): Promise<{ id: string } | null>;
  buscarVeiculo(veiculoId: string, clienteId: string): Promise<{ id: string } | null>;
}
