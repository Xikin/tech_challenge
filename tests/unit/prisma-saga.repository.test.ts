import { describe, it, expect, vi } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { PrismaSagaRepository } from '../../src/infrastructure/database/repositories/prisma-saga.repository';
import {
  ConflitoDeVersaoError,
  type TransicaoSaga,
} from '../../src/domain/repositories/saga.repository.interface';

const usarMockComoTransacao = () =>
  vi
    .mocked(prisma.$transaction)
    .mockImplementation((async (fn: (tx: unknown) => unknown) => fn(prisma)) as never);

const transicao = (sobrescrever: Partial<TransicaoSaga> = {}): TransicaoSaga => ({
  sagaId: 's-1',
  ordemId: 'o-1',
  versaoEsperada: 2,
  estado: {
    etapa: 'APROVACAO',
    status: 'EM_ANDAMENTO',
    participantes: ['execucao', 'billing'],
    compensacoesPendentes: [],
    motivoFalha: null,
  },
  mudancaDeStatus: null,
  efeitos: {},
  passos: [{ direcao: 'RECEBIDA', tipo: 't', mensagemId: 'm-1' }],
  saidas: [],
  mensagemProcessada: null,
  ...sobrescrever,
});

describe('PrismaSagaRepository.aplicarTransicao', () => {
  it('rejeita com ConflitoDeVersaoError quando a versão mudou', async () => {
    usarMockComoTransacao();
    vi.mocked(prisma.sagaOS.updateMany).mockResolvedValue({ count: 0 } as never);
    await expect(new PrismaSagaRepository().aplicarTransicao(transicao())).rejects.toThrow(
      ConflitoDeVersaoError,
    );
    expect(prisma.passoSaga.createMany).not.toHaveBeenCalled();
  });

  it('grava estado, status com marco de data, histórico, itens, outbox e deduplicação juntos', async () => {
    usarMockComoTransacao();
    vi.mocked(prisma.sagaOS.updateMany).mockResolvedValue({ count: 1 } as never);

    await new PrismaSagaRepository().aplicarTransicao(
      transicao({
        mudancaDeStatus: {
          anterior: 'AGUARDANDO_APROVACAO',
          novo: 'AGUARDANDO_PAGAMENTO',
          observacao: 'ok',
        },
        efeitos: {
          orcamentoId: 'orc-1',
          valorTotal: 100,
          linkPagamento: 'https://mp/p',
          itens: [
            { tipo: 'PECA', referenciaId: 'p', nome: 'Filtro', quantidade: 2, precoUnitario: 50 },
          ],
        },
        saidas: [
          {
            mensagem: {
              id: 'out-1',
              tipo: 'billing.comando.cancelar',
              versao: 1,
              sagaId: 's-1',
              ordemId: 'o-1',
              causadaPor: 'm-1',
              origem: 'oficina-os',
              ocorridaEm: new Date().toISOString(),
              dados: {},
            },
            cabecalhos: { traceparent: 'tp' },
          },
        ],
        mensagemProcessada: { id: 'm-1', consumidor: 'os.saga' },
      }),
    );

    expect(prisma.sagaOS.updateMany).toHaveBeenCalledWith({
      where: { id: 's-1', versao: 2 },
      data: expect.objectContaining({ etapa: 'APROVACAO', versao: { increment: 1 } }),
    });
    expect(prisma.ordemServico.update).toHaveBeenCalledWith({
      where: { id: 'o-1' },
      data: expect.objectContaining({
        status: 'AGUARDANDO_PAGAMENTO',
        aprovadoEm: expect.any(Date),
        orcamentoId: 'orc-1',
        valorTotal: 100,
        linkPagamento: 'https://mp/p',
      }),
    });
    expect(prisma.historicoOS.create).toHaveBeenCalled();
    expect(prisma.itemOS.deleteMany).toHaveBeenCalledWith({ where: { ordemId: 'o-1' } });
    expect(prisma.itemOS.createMany).toHaveBeenCalledWith({
      data: [
        {
          ordemId: 'o-1',
          tipo: 'PECA',
          referenciaId: 'p',
          nome: 'Filtro',
          quantidade: 2,
          precoUnitario: 50,
        },
      ],
    });
    expect(prisma.outbox.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: 'out-1',
          routingKey: 'billing.comando.cancelar',
          cabecalhos: { traceparent: 'tp' },
        }),
      ],
    });
    expect(prisma.mensagemProcessada.create).toHaveBeenCalledWith({
      data: { id: 'm-1', consumidor: 'os.saga' },
    });
  });

  it('sem efeitos nem mudança de status não toca na OS', async () => {
    usarMockComoTransacao();
    vi.mocked(prisma.sagaOS.updateMany).mockResolvedValue({ count: 1 } as never);
    await new PrismaSagaRepository().aplicarTransicao(transicao());
    expect(prisma.ordemServico.update).not.toHaveBeenCalled();
    expect(prisma.outbox.createMany).not.toHaveBeenCalled();
    expect(prisma.mensagemProcessada.create).not.toHaveBeenCalled();
  });
});

describe('PrismaSagaRepository — consultas', () => {
  it('buscarPorOrdem devolve null ou a saga', async () => {
    const repo = new PrismaSagaRepository();
    vi.mocked(prisma.sagaOS.findUnique).mockResolvedValueOnce(null);
    expect(await repo.buscarPorOrdem('o')).toBeNull();
    vi.mocked(prisma.sagaOS.findUnique).mockResolvedValueOnce({
      id: 's',
      participantes: ['execucao'],
      compensacoesPendentes: [],
    } as never);
    expect((await repo.buscarPorOrdem('o'))?.participantes).toEqual(['execucao']);
  });

  it('buscarComPassos devolve null quando não há saga', async () => {
    vi.mocked(prisma.sagaOS.findUnique).mockResolvedValue(null);
    expect(await new PrismaSagaRepository().buscarComPassos('o')).toBeNull();
  });

  it('jaProcessada compara o consumidor', async () => {
    const repo = new PrismaSagaRepository();
    vi.mocked(prisma.mensagemProcessada.findUnique).mockResolvedValueOnce({
      id: 'm',
      consumidor: 'os.saga',
    } as never);
    expect(await repo.jaProcessada('m', 'os.saga')).toBe(true);
    vi.mocked(prisma.mensagemProcessada.findUnique).mockResolvedValueOnce(null);
    expect(await repo.jaProcessada('m', 'os.saga')).toBe(false);
  });
});
