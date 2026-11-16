import type { StatusOS } from '../enums/status-os.enum';
import type { MensagemSaida } from '../mensageria/mensagem';
import type { EfeitosNaOrdem, EstadoSaga } from '../saga/saga-os';

export interface SagaRecord extends EstadoSaga {
  id: string;
  ordemId: string;
  versao: number;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface PassoSagaRecord {
  id: string;
  direcao: 'ENVIADA' | 'RECEBIDA';
  tipo: string;
  mensagemId: string;
  detalhe: string | null;
  criadoEm: Date;
}

export interface SagaComPassos extends SagaRecord {
  passos: PassoSagaRecord[];
}

export interface PassoNovo {
  direcao: 'ENVIADA' | 'RECEBIDA';
  tipo: string;
  mensagemId: string;
  detalhe?: string;
}

export interface TransicaoSaga {
  sagaId: string;
  ordemId: string;
  versaoEsperada: number;
  estado: EstadoSaga;
  mudancaDeStatus: { anterior: StatusOS; novo: StatusOS; observacao: string } | null;
  efeitos: EfeitosNaOrdem;
  passos: PassoNovo[];
  saidas: MensagemSaida[];
  mensagemProcessada: { id: string; consumidor: string } | null;
}

export class ConflitoDeVersaoError extends Error {
  constructor(sagaId: string) {
    super(`A saga ${sagaId} foi alterada por outro processo; a mensagem será reprocessada`);
    this.name = 'ConflitoDeVersaoError';
  }
}

export interface ISagaRepository {
  buscarPorOrdem(ordemId: string): Promise<SagaRecord | null>;
  buscarComPassos(ordemId: string): Promise<SagaComPassos | null>;
  jaProcessada(mensagemId: string, consumidor: string): Promise<boolean>;
  aplicarTransicao(transicao: TransicaoSaga): Promise<void>;
}
