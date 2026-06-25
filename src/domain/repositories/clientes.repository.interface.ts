import type { TipoPessoa } from "@prisma/client";

export interface ClienteRecord {
  id: string;
  nome: string;
  cpfCnpj: string;
  tipoPessoa: TipoPessoa;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface ListarClientesParams {
  page: number;
  limit: number;
  busca?: string;
}

export interface CriarClienteData {
  nome: string;
  cpfCnpj: string;
  email?: string;
  telefone?: string;
  endereco?: string;
}

export interface AtualizarClienteData {
  nome?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
}

export interface IClienteRepository {
  criar(data: CriarClienteData): Promise<ClienteRecord>;
  buscarPorId(id: string): Promise<ClienteRecord & Record<string, unknown> | null>;
  buscarPorCpfCnpj(cpfCnpj: string): Promise<ClienteRecord | null>;
  listar(params: ListarClientesParams): Promise<{ data: (ClienteRecord & Record<string, unknown>)[]; total: number }>;
  atualizar(id: string, data: AtualizarClienteData): Promise<ClienteRecord>;
  remover(id: string): Promise<ClienteRecord>;
}
