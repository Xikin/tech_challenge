import { describe, it, expect, vi, beforeEach } from 'vitest';

const nr = vi.hoisted(() => {
  const transacao = {
    insertDistributedTraceHeaders: vi.fn(),
    acceptDistributedTraceHeaders: vi.fn(),
  };
  return {
    transacao,
    api: {
      getTransaction: vi.fn(),
      startBackgroundTransaction: vi.fn(),
      addCustomAttributes: vi.fn(),
    },
  };
});

vi.mock('newrelic', () => ({ default: nr.api }));

import { RastreamentoNewRelic } from '../../src/infrastructure/observabilidade/rastreamento-newrelic';

beforeEach(() => {
  nr.transacao.insertDistributedTraceHeaders.mockImplementation((h: Record<string, string>) => {
    h.traceparent = '00-trace-span-01';
  });
  nr.api.getTransaction.mockReturnValue(nr.transacao);
  nr.api.startBackgroundTransaction.mockImplementation(
    (_n: string, _g: string, fn: () => unknown) => fn(),
  );
});

describe('RastreamentoNewRelic', () => {
  it('extrai os cabeçalhos de trace distribuído da transação atual', () => {
    expect(new RastreamentoNewRelic().cabecalhosDePropagacao()).toEqual({
      traceparent: '00-trace-span-01',
    });
  });

  it('abre transação de background, aceita o trace da mensagem e anota atributos', async () => {
    const resultado = await new RastreamentoNewRelic().consumir(
      'os.saga/billing.evento.cancelado',
      { traceparent: '00-a-b-01' },
      { sagaId: 's-1' },
      async () => 'ok',
    );

    expect(resultado).toBe('ok');
    expect(nr.api.startBackgroundTransaction).toHaveBeenCalledWith(
      'os.saga/billing.evento.cancelado',
      'RabbitMQ',
      expect.any(Function),
    );
    expect(nr.transacao.acceptDistributedTraceHeaders).toHaveBeenCalledWith('AMQP', {
      traceparent: '00-a-b-01',
    });
    expect(nr.api.addCustomAttributes).toHaveBeenCalledWith({ sagaId: 's-1' });
  });
});
