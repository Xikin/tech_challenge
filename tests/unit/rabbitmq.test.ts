import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MensagemInvalidaError } from '../../src/domain/mensageria/mensagem';

const estado = vi.hoisted(() => ({
  conectar: vi.fn(),
}));

vi.mock('amqplib', () => ({ connect: estado.conectar }));

import { RabbitMQ, type Consumidor } from '../../src/infrastructure/mensageria/rabbitmq';

type Entregador = (entrega: unknown) => void;

function criarAmbiente() {
  const canalPublicacao = Object.assign(new EventEmitter(), {
    assertExchange: vi.fn(),
    assertQueue: vi.fn(),
    bindQueue: vi.fn(),
    publish: vi.fn((_ex, _rk, _c, _o, cb: (e: unknown) => void) => {
      cb(null);
      return true;
    }),
    sendToQueue: vi.fn((_q, _c, _o, cb: (e: unknown) => void) => {
      cb(null);
      return true;
    }),
  });
  const entregadores: Record<string, Entregador> = {};
  const canalConsumo = {
    prefetch: vi.fn(),
    consume: vi.fn((fila: string, fn: Entregador) => {
      entregadores[fila] = fn;
    }),
    ack: vi.fn(),
    nack: vi.fn(),
  };
  const model = {
    createConfirmChannel: vi.fn().mockResolvedValue(canalPublicacao),
    createChannel: vi.fn().mockResolvedValue(canalConsumo),
  };
  const conexao = Object.assign(new EventEmitter(), { close: vi.fn() });

  estado.conectar.mockImplementation(
    async (_url: string, opcoes: { recovery: { setup: (m: unknown) => Promise<void> } }) => {
      await opcoes.recovery.setup(model);
      return conexao;
    },
  );

  return { canalPublicacao, canalConsumo, entregadores, conexao };
}

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const rastreamento = {
  consumir: vi.fn((_n: string, _c: unknown, _a: unknown, executar: () => Promise<unknown>) =>
    executar(),
  ),
};

function criarBroker(maxTentativas = 3) {
  return new RabbitMQ({
    url: 'amqp://teste',
    exchange: 'oficina.saga',
    servico: 'oficina-os',
    maxTentativas,
    atrasoRetentativaMs: 5000,
    logger,
    rastreamento,
  });
}

function entrega(corpo: unknown, cabecalhos: Record<string, unknown> = {}) {
  return {
    content: Buffer.from(typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
    fields: { routingKey: 'execucao.evento.cancelada' },
    properties: {
      messageId: 'm-1',
      type: 'execucao.evento.cancelada',
      correlationId: 'saga-1',
      headers: cabecalhos,
    },
  };
}

const esperar = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  rastreamento.consumir.mockImplementation((_n, _c, _a, executar) => executar());
});

describe('RabbitMQ — topologia', () => {
  it('declara exchange, fila principal, fila de retentativa com TTL e DLQ, e liga os bindings', async () => {
    const { canalPublicacao, canalConsumo } = criarAmbiente();
    const broker = criarBroker();
    broker.registrar({
      fila: 'os.saga',
      bindings: ['execucao.evento.#'],
      prefetch: 5,
      tratar: vi.fn(),
    });

    await broker.conectar();

    expect(canalPublicacao.assertExchange).toHaveBeenCalledWith('oficina.saga', 'topic', {
      durable: true,
    });
    expect(canalPublicacao.assertQueue).toHaveBeenCalledWith('os.saga', { durable: true });
    expect(canalPublicacao.assertQueue).toHaveBeenCalledWith('os.saga.retry', {
      durable: true,
      arguments: {
        'x-message-ttl': 5000,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': 'os.saga',
      },
    });
    expect(canalPublicacao.assertQueue).toHaveBeenCalledWith('os.saga.dlq', { durable: true });
    expect(canalPublicacao.bindQueue).toHaveBeenCalledWith(
      'os.saga',
      'oficina.saga',
      'execucao.evento.#',
    );
    expect(canalConsumo.prefetch).toHaveBeenCalledWith(5);
    expect(broker.conectado).toBe(true);
  });

  it('registra eventos de conexão e marca desconectado', async () => {
    const { conexao } = criarAmbiente();
    const broker = criarBroker();
    await broker.conectar();

    conexao.emit('disconnect', new Error('caiu'));
    expect(broker.conectado).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'mensageria_desconectada' }),
      expect.any(String),
    );

    conexao.emit('connect');
    conexao.emit('reconnect-failed', new Error('desisti'));
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'mensageria_reconexao_falhou' }),
      expect.any(String),
    );
  });

  it('encerra a conexão', async () => {
    const { conexao } = criarAmbiente();
    const broker = criarBroker();
    await broker.conectar();
    await broker.encerrar();
    expect(conexao.close).toHaveBeenCalled();
    expect(broker.conectado).toBe(false);
    await broker.encerrar();
  });
});

describe('RabbitMQ — publicação', () => {
  it('publica persistente, obrigatória e com cabeçalhos de rastreamento', async () => {
    const { canalPublicacao } = criarAmbiente();
    const broker = criarBroker();
    await broker.conectar();

    await broker.publicar(
      'execucao.comando.cancelar',
      { id: 'm-9', tipo: 'execucao.comando.cancelar', sagaId: 's-1' },
      { traceparent: 'tp' },
    );

    const [exchange, routingKey, , opcoes] = canalPublicacao.publish.mock.calls[0];
    expect(exchange).toBe('oficina.saga');
    expect(routingKey).toBe('execucao.comando.cancelar');
    expect(opcoes).toMatchObject({
      persistent: true,
      mandatory: true,
      messageId: 'm-9',
      type: 'execucao.comando.cancelar',
      correlationId: 's-1',
      appId: 'oficina-os',
      headers: { traceparent: 'tp' },
    });
  });

  it('falha quando o broker não confirma', async () => {
    const { canalPublicacao } = criarAmbiente();
    canalPublicacao.publish.mockImplementation((_e, _r, _c, _o, cb) => {
      cb('nack');
      return true;
    });
    const broker = criarBroker();
    await broker.conectar();
    await expect(broker.publicar('x', { id: '1', tipo: 'x' }, {})).rejects.toThrow('nack');
  });

  it('falha quando nenhuma fila recebe a mensagem', async () => {
    const { canalPublicacao } = criarAmbiente();
    canalPublicacao.publish.mockImplementation((_e, _r, _c, _o, cb) => {
      canalPublicacao.emit('return', { properties: { messageId: 'sem-rota' } });
      cb(null);
      return true;
    });
    const broker = criarBroker();
    await broker.conectar();
    await expect(broker.publicar('x', { id: 'sem-rota', tipo: 'x' }, {})).rejects.toThrow(
      /Nenhuma fila/,
    );
  });

  it('falha sem conexão', async () => {
    await expect(criarBroker().publicar('x', { id: '1', tipo: 'x' }, {})).rejects.toThrow(
      'RabbitMQ indisponível',
    );
  });
});

describe('RabbitMQ — consumo, retentativa e DLQ', () => {
  async function preparar(tratar: Consumidor['tratar'], maxTentativas = 3) {
    const ambiente = criarAmbiente();
    const broker = criarBroker(maxTentativas);
    broker.registrar({ fila: 'os.saga', bindings: [], tratar });
    await broker.conectar();
    return ambiente;
  }

  it('confirma (ack) quando o tratamento dá certo, dentro de uma transação rastreada', async () => {
    const tratar = vi.fn().mockResolvedValue(undefined);
    const { entregadores, canalConsumo } = await preparar(tratar);

    const recebida = entrega({ ok: true }, { traceparent: 'tp' });
    entregadores['os.saga'](recebida);
    await esperar();

    expect(tratar).toHaveBeenCalledWith({ ok: true });
    expect(rastreamento.consumir).toHaveBeenCalledWith(
      'os.saga/execucao.evento.cancelada',
      { traceparent: 'tp' },
      expect.objectContaining({ mensagemId: 'm-1', sagaId: 'saga-1' }),
      expect.any(Function),
    );
    expect(canalConsumo.ack).toHaveBeenCalledWith(recebida);
  });

  it('ignora entrega nula (consumidor cancelado pelo broker)', async () => {
    const tratar = vi.fn();
    const { entregadores } = await preparar(tratar);
    entregadores['os.saga'](null);
    await esperar();
    expect(tratar).not.toHaveBeenCalled();
  });

  it('erro transitório vai para a fila de retentativa com o contador incrementado', async () => {
    const { entregadores, canalPublicacao, canalConsumo } = await preparar(
      vi.fn().mockRejectedValue(new Error('banco fora')),
    );

    entregadores['os.saga'](entrega({}, { 'x-tentativas': 1 }));
    await esperar();

    const [fila, , opcoes] = canalPublicacao.sendToQueue.mock.calls[0];
    expect(fila).toBe('os.saga.retry');
    expect(opcoes.headers).toMatchObject({ 'x-tentativas': 2, 'x-ultimo-erro': 'banco fora' });
    expect(canalConsumo.ack).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'mensagem_falhou', destino: 'os.saga.retry' }),
      expect.any(String),
    );
  });

  it('esgotadas as tentativas, a mensagem vai para a DLQ', async () => {
    const { entregadores, canalPublicacao } = await preparar(
      vi.fn().mockRejectedValue(new Error('persistente')),
      3,
    );
    entregadores['os.saga'](entrega({}, { 'x-tentativas': 2 }));
    await esperar();
    expect(canalPublicacao.sendToQueue.mock.calls[0][0]).toBe('os.saga.dlq');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ destino: 'os.saga.dlq' }),
      expect.any(String),
    );
  });

  it('mensagem inválida vai direto para a DLQ, sem retentativa', async () => {
    const { entregadores, canalPublicacao } = await preparar(
      vi.fn().mockRejectedValue(new MensagemInvalidaError('tipo desconhecido')),
    );
    entregadores['os.saga'](entrega({}));
    await esperar();
    expect(canalPublicacao.sendToQueue.mock.calls[0][0]).toBe('os.saga.dlq');
  });

  it('JSON malformado vai direto para a DLQ', async () => {
    const tratar = vi.fn();
    const { entregadores, canalPublicacao } = await preparar(tratar);
    entregadores['os.saga'](entrega('{nao-e-json'));
    await esperar();
    expect(tratar).not.toHaveBeenCalled();
    expect(canalPublicacao.sendToQueue.mock.calls[0][0]).toBe('os.saga.dlq');
  });

  it('se nem o reencaminhamento funciona, devolve a mensagem para a fila (nack com requeue)', async () => {
    const { entregadores, canalPublicacao, canalConsumo } = await preparar(
      vi.fn().mockRejectedValue('erro não-Error'),
    );
    canalPublicacao.sendToQueue.mockImplementation((_q, _c, _o, cb) => {
      cb(new Error('canal fechado'));
      return false;
    });
    const recebida = entrega({});
    entregadores['os.saga'](recebida);
    await esperar();
    expect(canalConsumo.nack).toHaveBeenCalledWith(recebida, false, true);
    expect(canalConsumo.ack).not.toHaveBeenCalled();
  });
});
