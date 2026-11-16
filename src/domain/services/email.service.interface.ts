export interface EnviarEmailStatusInput {
  destinatario: string;
  nomeCliente: string;
  numeroOS: number;
  statusAnterior: string;
  statusNovo: string;
  observacao?: string;
}

export interface EnviarEmailAprovacaoInput {
  destinatario: string;
  nomeCliente: string;
  numeroOS: number;
  valorTotal: number;
}

export interface EnviarEmailPagamentoInput {
  destinatario: string;
  nomeCliente: string;
  numeroOS: number;
  valorTotal: number;
  linkPagamento: string;
}

export interface IEmailService {
  enviarStatusAtualizado(dados: EnviarEmailStatusInput): Promise<void>;
  enviarAprovacaoSolicitada(dados: EnviarEmailAprovacaoInput): Promise<void>;
  enviarPagamentoSolicitado(dados: EnviarEmailPagamentoInput): Promise<void>;
}
