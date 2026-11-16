import { describe, it, expect, vi } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { OutboxRelay } from '../../src/infrastructure/mensageria/outbox-relay';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function prepararTransacao(linhas: unknown[]) {
  vi.mocked(prisma.$queryRaw).mockResolvedValue(linhas as never);
  vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) =>
    fn(prisma)) as never);
}

const linha = (id: string) => ({
  id,
  routingKey: 'execucao.comando.abrir-diagnostico',
  payload: { id, tipo: 'execucao.comando.abrir-diagnostico' },
  cabecalhos: { traceparent: 'tp' },
});

describe('OutboxRelay', () => {
  it('publica pendentes em ordem e marca cada uma como publicada', async () => {
    prepararTransacao([linha('a'), linha('b')]);
    const publicador = { publicar: vi.fn().mockResolvedValue(undefined) };

    const publicadas = await new OutboxRelay(publicador, logger).publicarPendentes();

    expect(publicadas).toBe(2);
    expect(publicador.publicar.mock.calls.map((c) => c[1].id)).toEqual(['a', 'b']);
    expect(publicador.publicar).toHaveBeenCalledWith(
      'execucao.comando.abrir-diagnostico',
      expect.anything(),
      { traceparent: 'tp' },
    );
    expect(prisma.outbox.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { publicadoEm: expect.any(Date) },
    });
  });

  it('para no primeiro erro para preservar a ordem e conta a tentativa', async () => {
    prepararTransacao([linha('a'), linha('b')]);
    const publicador = { publicar: vi.fn().mockRejectedValue(new Error('broker fora')) };

    const publicadas = await new OutboxRelay(publicador, logger).publicarPendentes();

    expect(publicadas).toBe(0);
    expect(publicador.publicar).toHaveBeenCalledTimes(1);
    expect(prisma.outbox.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { tentativas: { increment: 1 } },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'outbox_publicacao_adiada', mensagemId: 'a' }),
      expect.any(String),
    );
  });

  it('roda em ciclos, limpa publicadas antigas e para de forma limpa', async () => {
    vi.useFakeTimers();
    prepararTransacao([]);
    const relay = new OutboxRelay({ publicar: vi.fn() }, logger, {
      intervaloMs: 100,
      lote: 10,
      retencaoHoras: 1,
    });

    relay.iniciar();
    relay.iniciar();
    await vi.advanceTimersByTimeAsync(250);
    await relay.parar();
    vi.useRealTimers();

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.outbox.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.outbox.deleteMany).toHaveBeenCalledWith({
      where: { publicadoEm: { lt: expect.any(Date) } },
    });
  });

  it('registra falha do ciclo sem derrubar o processo', async () => {
    vi.useFakeTimers();
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('banco fora'));
    const relay = new OutboxRelay({ publicar: vi.fn() }, logger, {
      intervaloMs: 50,
      lote: 1,
      retencaoHoras: 1,
    });
    relay.iniciar();
    await vi.advanceTimersByTimeAsync(60);
    await relay.parar();
    vi.useRealTimers();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'outbox_falhou', erro: 'banco fora' }),
      expect.any(String),
    );
  });
});
