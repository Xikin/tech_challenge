import { describe, it, expect, vi } from 'vitest';
import { CriarPecaUseCase } from '../../src/application/use-cases/pecas/criar-peca.use-case';
import { AjustarEstoqueUseCase } from '../../src/application/use-cases/pecas/ajustar-estoque.use-case';
import { AlertasEstoqueUseCase } from '../../src/application/use-cases/pecas/alertas-estoque.use-case';
import type { IPecaRepository } from '../../src/domain/repositories/pecas.repository.interface';
import { ConflictError, NotFoundError, StockError } from '../../src/shared/errors';

const makeRepo = () =>
  ({
    criar: vi.fn(),
    buscarPorNome: vi.fn(),
    buscarPorId: vi.fn(),
    listar: vi.fn(),
    listarTodas: vi.fn(),
    atualizar: vi.fn(),
    incrementarEstoque: vi.fn(),
    remover: vi.fn(),
  }) as unknown as IPecaRepository;

const mock = {
  id: 'p1',
  nome: 'Óleo',
  descricao: null,
  preco: 28,
  quantidade: 50,
  estoqueMin: 10,
  unidade: 'L',
  ativo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

describe('CriarPecaUseCase', () => {
  it('cria com sucesso', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorNome).mockResolvedValue(null);
    vi.mocked(repo.criar).mockResolvedValue(mock as any);
    const result = await new CriarPecaUseCase(repo).execute({
      nome: 'Óleo',
      preco: 28,
      quantidade: 50,
      estoqueMin: 10,
      unidade: 'L',
    });
    expect(result).toEqual(mock);
  });

  it('lança ConflictError nome duplicado', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorNome).mockResolvedValue(mock as any);
    await expect(
      new CriarPecaUseCase(repo).execute({
        nome: 'Óleo',
        preco: 28,
        quantidade: 50,
        estoqueMin: 10,
        unidade: 'L',
      }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('AjustarEstoqueUseCase', () => {
  it('incrementa positivo', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue(mock as any);
    vi.mocked(repo.incrementarEstoque).mockResolvedValue({ ...mock, quantidade: 55 } as any);
    const result = await new AjustarEstoqueUseCase(repo).execute('p1', { quantidade: 5 });
    expect(result.quantidade).toBe(55);
  });

  it('lança StockError saldo negativo', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue({ ...mock, quantidade: 3 } as any);
    await expect(
      new AjustarEstoqueUseCase(repo).execute('p1', { quantidade: -10 }),
    ).rejects.toThrow(StockError);
  });

  it('lança NotFoundError peça não encontrada', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue(null);
    await expect(new AjustarEstoqueUseCase(repo).execute('x', { quantidade: 5 })).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe('AlertasEstoqueUseCase', () => {
  it('retorna peças abaixo do mínimo', async () => {
    const repo = makeRepo();
    vi.mocked(repo.listarTodas).mockResolvedValue([
      { id: 'p1', nome: 'A', quantidade: 5, estoqueMin: 10, unidade: 'un' },
      { id: 'p2', nome: 'B', quantidade: 20, estoqueMin: 10, unidade: 'un' },
    ] as any);
    const result = await new AlertasEstoqueUseCase(repo).execute();
    expect(result).toHaveLength(1);
    expect(result[0].deficit).toBe(5);
  });
});
