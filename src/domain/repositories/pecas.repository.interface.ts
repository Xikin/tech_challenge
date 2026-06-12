export interface PecaRecord {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  quantidade: number;
  estoqueMin: number;
  unidade: string;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface PecaMinima {
  id: string;
  nome: string;
  quantidade: number;
  estoqueMin: number;
  unidade: string;
}

export interface ListarPecasParams {
  page: number;
  limit: number;
  busca?: string;
}

export interface CriarPecaData {
  nome: string;
  descricao?: string;
  preco: number;
  quantidade: number;
  estoqueMin: number;
  unidade: string;
}

export interface AtualizarPecaData {
  nome?: string;
  descricao?: string;
  preco?: number;
  estoqueMin?: number;
  unidade?: string;
}

export interface IPecaRepository {
  criar(data: CriarPecaData): Promise<PecaRecord>;
  buscarPorId(id: string): Promise<PecaRecord | null>;
  buscarPorNome(nome: string, excludeId?: string): Promise<PecaRecord | null>;
  listar(params: ListarPecasParams): Promise<{ data: PecaRecord[]; total: number }>;
  listarTodas(): Promise<PecaMinima[]>;
  atualizar(id: string, data: AtualizarPecaData): Promise<PecaRecord>;
  incrementarEstoque(id: string, delta: number): Promise<PecaRecord>;
  remover(id: string): Promise<PecaRecord>;
}
