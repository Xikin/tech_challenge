import { describe, it, expect } from 'vitest';
import {
  CANCELAMENTO_SOLICITADO,
  decidir,
  iniciarSaga,
  podeCancelar,
  valorDosItens,
  type EstadoSaga,
  type EventoSaga,
  type ItemOrcado,
} from '../../src/domain/saga/saga-os';
import { COMANDOS, EVENTOS } from '../../src/domain/mensageria/mensagem';

const itens: ItemOrcado[] = [
  {
    tipo: 'SERVICO',
    referenciaId: 's1',
    nome: 'Troca de óleo',
    quantidade: 1,
    precoUnitario: 89.9,
  },
  { tipo: 'PECA', referenciaId: 'p1', nome: 'Filtro', quantidade: 2, precoUnitario: 22.1 },
];

function aplicar(estado: EstadoSaga, ...eventos: EventoSaga[]) {
  return eventos.reduce((atual, evento) => decidir(atual, evento).estado, estado);
}

const inicial = () => iniciarSaga().estado;

const ateAprovacao = () =>
  aplicar(
    inicial(),
    { tipo: EVENTOS.DIAGNOSTICO_INICIADO },
    { tipo: EVENTOS.DIAGNOSTICO_CONCLUIDO, itens },
    { tipo: EVENTOS.ORCAMENTO_GERADO, orcamentoId: 'orc-1', valorTotal: 134.1 },
  );

const atePagamento = () =>
  aplicar(ateAprovacao(), {
    tipo: EVENTOS.ORCAMENTO_APROVADO,
    orcamentoId: 'orc-1',
    linkPagamento: 'https://mp.test/pagar',
  });

const ateExecucao = () =>
  aplicar(atePagamento(), {
    tipo: EVENTOS.PAGAMENTO_CONFIRMADO,
    pagamentoId: 'pg-1',
    valor: 134.1,
  });

describe('iniciarSaga', () => {
  it('abre na etapa de diagnóstico com o serviço de execução como participante', () => {
    const decisao = iniciarSaga();
    expect(decisao.estado).toEqual({
      etapa: 'DIAGNOSTICO',
      status: 'EM_ANDAMENTO',
      participantes: ['execucao'],
      compensacoesPendentes: [],
      motivoFalha: null,
    });
    expect(decisao.statusOS).toBe('RECEBIDA');
    expect(decisao.comandos).toEqual([COMANDOS.ABRIR_DIAGNOSTICO]);
  });
});

describe('caminho feliz', () => {
  it('diagnóstico iniciado muda a OS para Em Diagnóstico sem mudar de etapa', () => {
    const decisao = decidir(inicial(), { tipo: EVENTOS.DIAGNOSTICO_INICIADO });
    expect(decisao.statusOS).toBe('EM_DIAGNOSTICO');
    expect(decisao.estado.etapa).toBe('DIAGNOSTICO');
    expect(decisao.comandos).toEqual([]);
  });

  it('diagnóstico concluído pede orçamento, inclui o billing e calcula o valor em centavos', () => {
    const decisao = decidir(inicial(), { tipo: EVENTOS.DIAGNOSTICO_CONCLUIDO, itens });
    expect(decisao.estado.etapa).toBe('ORCAMENTO');
    expect(decisao.estado.participantes).toEqual(['execucao', 'billing']);
    expect(decisao.comandos).toEqual([COMANDOS.GERAR_ORCAMENTO]);
    expect(decisao.efeitos).toEqual({ itens, valorTotal: 134.1 });
  });

  it('usa a observação do mecânico no histórico quando enviada', () => {
    const decisao = decidir(inicial(), {
      tipo: EVENTOS.DIAGNOSTICO_CONCLUIDO,
      itens,
      observacao: 'Vazamento no cárter',
    });
    expect(decisao.observacao).toBe('Vazamento no cárter');
  });

  it('orçamento gerado aguarda aprovação do cliente', () => {
    const estado = aplicar(inicial(), { tipo: EVENTOS.DIAGNOSTICO_CONCLUIDO, itens });
    const decisao = decidir(estado, {
      tipo: EVENTOS.ORCAMENTO_GERADO,
      orcamentoId: 'orc-1',
      valorTotal: 134.1,
    });
    expect(decisao.estado.etapa).toBe('APROVACAO');
    expect(decisao.statusOS).toBe('AGUARDANDO_APROVACAO');
    expect(decisao.efeitos).toEqual({ orcamentoId: 'orc-1', valorTotal: 134.1 });
  });

  it('orçamento aprovado aguarda pagamento e guarda o link', () => {
    const decisao = decidir(ateAprovacao(), {
      tipo: EVENTOS.ORCAMENTO_APROVADO,
      orcamentoId: 'orc-1',
      linkPagamento: 'https://mp.test/pagar',
    });
    expect(decisao.estado.etapa).toBe('PAGAMENTO');
    expect(decisao.statusOS).toBe('AGUARDANDO_PAGAMENTO');
    expect(decisao.efeitos.linkPagamento).toBe('https://mp.test/pagar');
  });

  it('pagamento confirmado libera a execução', () => {
    const decisao = decidir(atePagamento(), {
      tipo: EVENTOS.PAGAMENTO_CONFIRMADO,
      pagamentoId: 'pg-1',
      valor: 134.1,
    });
    expect(decisao.estado.etapa).toBe('EXECUCAO');
    expect(decisao.statusOS).toBe('AGUARDANDO_EXECUCAO');
    expect(decisao.comandos).toEqual([COMANDOS.LIBERAR_EXECUCAO]);
    expect(decisao.efeitos.pago).toBe(true);
  });

  it('execução iniciada e finalizada concluem a saga', () => {
    const iniciada = decidir(ateExecucao(), { tipo: EVENTOS.EXECUCAO_INICIADA });
    expect(iniciada.statusOS).toBe('EM_EXECUCAO');

    const finalizada = decidir(iniciada.estado, { tipo: EVENTOS.EXECUCAO_FINALIZADA });
    expect(finalizada.estado).toMatchObject({ etapa: 'CONCLUIDA', status: 'CONCLUIDA' });
    expect(finalizada.statusOS).toBe('FINALIZADA');
  });
});

describe('compensação', () => {
  it.each([
    [
      'orçamento reprovado',
      ateAprovacao,
      { tipo: EVENTOS.ORCAMENTO_REPROVADO, orcamentoId: 'orc-1', motivo: 'Muito caro' },
      'Muito caro',
    ],
    [
      'reprovação sem motivo',
      ateAprovacao,
      { tipo: EVENTOS.ORCAMENTO_REPROVADO, orcamentoId: 'orc-1' },
      'Orçamento reprovado pelo cliente',
    ],
    [
      'pagamento recusado',
      atePagamento,
      { tipo: EVENTOS.PAGAMENTO_RECUSADO, motivo: 'cartão negado' },
      'Pagamento recusado: cartão negado',
    ],
    [
      'falha na execução',
      ateExecucao,
      { tipo: EVENTOS.EXECUCAO_FALHOU, motivo: 'peça com defeito' },
      'Falha na execução: peça com defeito',
    ],
  ] as const)('%s cancela execução e billing', (_nome, preparar, evento, motivo) => {
    const decisao = decidir(preparar(), evento as EventoSaga);
    expect(decisao.estado.status).toBe('COMPENSANDO');
    expect(decisao.estado.motivoFalha).toBe(motivo);
    expect(decisao.estado.compensacoesPendentes).toEqual(['execucao', 'billing']);
    expect(decisao.comandos).toEqual([COMANDOS.CANCELAR_EXECUCAO, COMANDOS.CANCELAR_BILLING]);
    expect(decisao.statusOS).toBeNull();
  });

  it('falha ao gerar orçamento compensa os dois participantes', () => {
    const estado = aplicar(inicial(), { tipo: EVENTOS.DIAGNOSTICO_CONCLUIDO, itens });
    const decisao = decidir(estado, { tipo: EVENTOS.ORCAMENTO_FALHOU, motivo: 'Mongo fora' });
    expect(decisao.estado.motivoFalha).toBe('Falha ao gerar orçamento: Mongo fora');
    expect(decisao.comandos).toEqual([COMANDOS.CANCELAR_EXECUCAO, COMANDOS.CANCELAR_BILLING]);
  });

  it('cancelamento durante o diagnóstico só compensa a execução', () => {
    const decisao = decidir(inicial(), { tipo: CANCELAMENTO_SOLICITADO, motivo: 'Desistiu' });
    expect(decisao.estado.compensacoesPendentes).toEqual(['execucao']);
    expect(decisao.comandos).toEqual([COMANDOS.CANCELAR_EXECUCAO]);
  });

  it('OS só é cancelada depois que todos os participantes confirmam', () => {
    const compensando = decidir(ateExecucao(), {
      tipo: EVENTOS.EXECUCAO_FALHOU,
      motivo: 'sem peça',
    }).estado;

    const primeira = decidir(compensando, { tipo: EVENTOS.BILLING_CANCELADO, estornado: true });
    expect(primeira.statusOS).toBeNull();
    expect(primeira.estado.compensacoesPendentes).toEqual(['execucao']);

    const segunda = decidir(primeira.estado, { tipo: EVENTOS.EXECUCAO_CANCELADA });
    expect(segunda.estado.status).toBe('COMPENSADA');
    expect(segunda.statusOS).toBe('CANCELADA');
    expect(segunda.observacao).toBe('OS cancelada: Falha na execução: sem peça');
  });

  it('confirmação repetida é ignorada', () => {
    const compensando = decidir(inicial(), {
      tipo: CANCELAMENTO_SOLICITADO,
      motivo: 'x',
    }).estado;
    const decisao = decidir(compensando, { tipo: EVENTOS.BILLING_CANCELADO, estornado: false });
    expect(decisao.aceita).toBe(false);
  });

  it('eventos de avanço são ignorados durante a compensação', () => {
    const compensando = decidir(atePagamento(), {
      tipo: CANCELAMENTO_SOLICITADO,
      motivo: 'x',
    }).estado;
    const decisao = decidir(compensando, {
      tipo: EVENTOS.PAGAMENTO_CONFIRMADO,
      pagamentoId: 'pg-1',
      valor: 10,
    });
    expect(decisao.aceita).toBe(false);
    expect(decisao.estado).toBe(compensando);
  });
});

describe('robustez', () => {
  it('marca como prematuro o evento de uma etapa que ainda não chegou', () => {
    const decisao = decidir(inicial(), {
      tipo: EVENTOS.PAGAMENTO_CONFIRMADO,
      pagamentoId: 'pg',
      valor: 1,
    });
    expect(decisao.aceita).toBe(false);
    expect(decisao.prematura).toBe(true);
    expect(decisao.observacao).toContain('chegou antes');
  });

  it('ignora sem adiar o evento de uma etapa que já passou', () => {
    const decisao = decidir(ateAprovacao(), { tipo: EVENTOS.DIAGNOSTICO_INICIADO });
    expect(decisao.aceita).toBe(false);
    expect(decisao.prematura).toBe(false);
    expect(decisao.observacao).toContain('fora de ordem');
  });

  it('ignora sem adiar confirmação de compensação que não foi pedida', () => {
    const decisao = decidir(inicial(), { tipo: EVENTOS.EXECUCAO_CANCELADA });
    expect(decisao.prematura).toBe(false);
  });

  it.each(['CONCLUIDA', 'COMPENSADA'] as const)('ignora qualquer evento com saga %s', (status) => {
    const decisao = decidir({ ...inicial(), status }, { tipo: EVENTOS.DIAGNOSTICO_INICIADO });
    expect(decisao.aceita).toBe(false);
  });

  it('não aceita eventos depois de concluída mesmo se o status não for atualizado', () => {
    const decisao = decidir(
      { ...inicial(), etapa: 'CONCLUIDA' },
      { tipo: EVENTOS.EXECUCAO_FINALIZADA },
    );
    expect(decisao.aceita).toBe(false);
  });

  it('podeCancelar só em andamento e antes da conclusão', () => {
    expect(podeCancelar(inicial())).toBe(true);
    expect(podeCancelar({ ...inicial(), status: 'COMPENSANDO' })).toBe(false);
    expect(podeCancelar({ ...inicial(), etapa: 'CONCLUIDA' })).toBe(false);
  });

  it('valorDosItens soma em centavos para evitar erro de ponto flutuante', () => {
    expect(
      valorDosItens([
        { tipo: 'PECA', referenciaId: 'a', nome: 'a', quantidade: 3, precoUnitario: 0.1 },
        { tipo: 'PECA', referenciaId: 'b', nome: 'b', quantidade: 1, precoUnitario: 0.2 },
      ]),
    ).toBe(0.5);
  });
});
