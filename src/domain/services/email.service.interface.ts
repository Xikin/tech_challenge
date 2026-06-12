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

export interface IEmailService {
  enviarStatusAtualizado(dados: EnviarEmailStatusInput): Promise<void>;
  enviarAprovacaoSolicitada(dados: EnviarEmailAprovacaoInput): Promise<void>;
}
