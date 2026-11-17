import { describe, it, expect } from 'vitest';
import {
  interpretarEvento,
  lerEnvelope,
  montarDadosDoComando,
  novaMensagem,
} from '../../src/application/saga/contratos';
import {
  COMANDOS,
  EVENTOS,
  MensagemInvalidaError,
  type Mensagem,
} from '../../src/domain/mensageria/mensagem';
import type { OrdemRecord } from '../../src/domain/repositories/ordens.repository.interface';

const ORDEM_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

function envelope(tipo: string, dados: Record<string, unknown>): Mensagem {
  return {
    id: 'm-1',
    tipo,
    versao: 1,
    sagaId: 's-1',
    ordemId: ORDEM_ID,
    causadaPor: null,
    origem: 'oficina-execucao',
    ocorridaEm: new Date().toISOString(),
    dados,
  };
}

const ordem = {
  id: ORDEM_ID,
  numero: 7,
  descricao: 'Barulho no freio',
  orcamentoId: 'orc-9',
  cliente: { id: 'c-1', nome: 'Ana', email: 'ana@x.com' },
  veiculo: { placa: 'ABC1D23', marca: 'VW', modelo: 'Gol', ano: 2019 },
} as unknown as OrdemRecord;

describe('lerEnvelope', () => {
  it('aceita envelope completo', () => {
    expect(lerEnvelope(envelope(EVENTOS.EXECUCAO_INICIADA, {})).tipo).toBe(
      EVENTOS.EXECUCAO_INICIADA,
    );
  });

  it('rejeita envelope sem ordemId válido', () => {
    expect(() => lerEnvelope({ ...envelope('x', {}), ordemId: 'nao-uuid' })).toThrow(
      MensagemInvalidaError,
    );
  });
});

describe('interpretarEvento', () => {
  it('traduz diagnóstico concluído com itens', () => {
    const evento = interpretarEvento(
      envelope(EVENTOS.DIAGNOSTICO_CONCLUIDO, {
        itens: [
          { tipo: 'SERVICO', referenciaId: 's', nome: 'Óleo', quantidade: 1, precoUnitario: 90 },
        ],
      }),
    );
    expect(evento).toMatchObject({ tipo: EVENTOS.DIAGNOSTICO_CONCLUIDO });
  });

  it('rejeita diagnóstico concluído sem itens', () => {
    expect(() => interpretarEvento(envelope(EVENTOS.DIAGNOSTICO_CONCLUIDO, { itens: [] }))).toThrow(
      /Dados inválidos/,
    );
  });

  it('rejeita aprovação com link inválido', () => {
    expect(() =>
      interpretarEvento(
        envelope(EVENTOS.ORCAMENTO_APROVADO, { orcamentoId: 'o', linkPagamento: 'nao-e-url' }),
      ),
    ).toThrow(MensagemInvalidaError);
  });

  it('rejeita tipo desconhecido', () => {
    expect(() => interpretarEvento(envelope('billing.evento.inventado', {}))).toThrow(
      /desconhecido/,
    );
  });
});

describe('montarDadosDoComando', () => {
  it('abrir diagnóstico leva os dados do veículo para a fila do mecânico', () => {
    expect(montarDadosDoComando(COMANDOS.ABRIR_DIAGNOSTICO, ordem, {})).toEqual({
      numeroOS: 7,
      descricao: 'Barulho no freio',
      veiculo: { placa: 'ABC1D23', marca: 'VW', modelo: 'Gol', ano: 2019 },
    });
  });

  it('gerar orçamento leva cliente e itens', () => {
    const itens = [
      { tipo: 'PECA' as const, referenciaId: 'p', nome: 'Filtro', quantidade: 1, precoUnitario: 1 },
    ];
    expect(montarDadosDoComando(COMANDOS.GERAR_ORCAMENTO, ordem, { itens })).toEqual({
      numeroOS: 7,
      cliente: { id: 'c-1', nome: 'Ana', email: 'ana@x.com' },
      itens,
    });
  });

  it('gerar orçamento sem itens envia lista vazia', () => {
    expect(montarDadosDoComando(COMANDOS.GERAR_ORCAMENTO, ordem, {}).itens).toEqual([]);
  });

  it('liberar execução leva o número da OS', () => {
    expect(montarDadosDoComando(COMANDOS.LIBERAR_EXECUCAO, ordem, {})).toEqual({ numeroOS: 7 });
  });

  it('cancelamentos levam o motivo, com padrão quando ausente', () => {
    expect(montarDadosDoComando(COMANDOS.CANCELAR_EXECUCAO, ordem, { motivo: 'x' })).toEqual({
      numeroOS: 7,
      motivo: 'x',
    });
    expect(montarDadosDoComando(COMANDOS.CANCELAR_BILLING, ordem, {})).toEqual({
      numeroOS: 7,
      orcamentoId: 'orc-9',
      motivo: 'Cancelamento da OS',
    });
    expect(montarDadosDoComando(COMANDOS.CANCELAR_EXECUCAO, ordem, {}).motivo).toBe(
      'Cancelamento da OS',
    );
  });
});

describe('novaMensagem', () => {
  it('monta envelope com id novo, origem e cabeçalhos de rastreamento', () => {
    const saida = novaMensagem(COMANDOS.LIBERAR_EXECUCAO, 's-1', ORDEM_ID, { a: 1 }, 'causa', {
      cabecalhosDePropagacao: () => ({ traceparent: 'tp' }),
    });
    expect(saida.mensagem).toMatchObject({
      tipo: COMANDOS.LIBERAR_EXECUCAO,
      versao: 1,
      sagaId: 's-1',
      ordemId: ORDEM_ID,
      causadaPor: 'causa',
      origem: 'oficina-os',
      dados: { a: 1 },
    });
    expect(saida.mensagem.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saida.cabecalhos).toEqual({ traceparent: 'tp' });
  });
});
