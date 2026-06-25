import type { Prisma } from "@prisma/client";

export interface ServicoRecord {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number | Prisma.Decimal;
  tempoPrevisto: number | null;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface ListarServicosParams {
  page: number;
  limit: number;
  busca?: string;
}

export interface CriarServicoData {
  nome: string;
  descricao?: string;
  preco: number;
  tempoPrevisto?: number;
}

export interface AtualizarServicoData {
  nome?: string;
  descricao?: string;
  preco?: number;
  tempoPrevisto?: number;
  ativo?: boolean;
}

export interface IServicoRepository {
  criar(data: CriarServicoData): Promise<ServicoRecord>;
  buscarPorId(id: string): Promise<ServicoRecord | null>;
  buscarPorNome(nome: string, excludeId?: string): Promise<ServicoRecord | null>;
  listar(params: ListarServicosParams): Promise<{ data: ServicoRecord[]; total: number }>;
  atualizar(id: string, data: AtualizarServicoData): Promise<ServicoRecord>;
  remover(id: string): Promise<ServicoRecord>;
  buscarEmOSAtiva(id: string): Promise<unknown>;
  buscarTemposReais(id: string): Promise<{ tempoReal: number | null }[]>;
}
