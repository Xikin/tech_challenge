import { describe, it, expect, vi } from 'vitest';
import { CriarServicoUseCase } from '../../src/application/use-cases/servicos/criar-servico.use-case';
import { BuscarServicoPorIdUseCase } from '../../src/application/use-cases/servicos/buscar-servico-por-id.use-case';
import { RemoverServicoUseCase } from '../../src/application/use-cases/servicos/remover-servico.use-case';
import { CalcularTempoMedioUseCase } from '../../src/application/use-cases/servicos/calcular-tempo-medio.use-case';
import type { IServicoRepository } from '../../src/domain/repositories/servicos.repository.interface';
import { ConflictError, NotFoundError, BusinessError } from '../../src/shared/errors';

const makeRepo = () =>
  ({
    criar: vi.fn(),
    buscarPorNome: vi.fn(),
    buscarPorId: vi.fn(),
    listar: vi.fn(),
    atualizar: vi.fn(),
    remover: vi.fn(),
    buscarEmOSAtiva: vi.fn(),
    buscarTemposReais: vi.fn(),
  }) as unknown as IServicoRepository;

const mock = {
  id: 's1',
  nome: 'Troca de Óleo',
  descricao: null,
  preco: 89.9,
  tempoPrevisto: 30,
  ativo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

describe('CriarServicoUseCase', () => {
  it('cria com sucesso', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorNome).mockResolvedValue(null);
    vi.mocked(repo.criar).mockResolvedValue(mock as any);
    expect(
      await new CriarServicoUseCase(repo).execute({ nome: 'Troca de Óleo', preco: 89.9 }),
    ).toEqual(mock);
  });

  it('lança ConflictError nome duplicado', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorNome).mockResolvedValue(mock as any);
    await expect(
      new CriarServicoUseCase(repo).execute({ nome: 'Troca de Óleo', preco: 89.9 }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('BuscarServicoPorIdUseCase', () => {
  it('retorna serviço', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue(mock as any);
    expect((await new BuscarServicoPorIdUseCase(repo).execute('s1')).id).toBe('s1');
  });

  it('lança NotFoundError', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue(null);
    await expect(new BuscarServicoPorIdUseCase(repo).execute('x')).rejects.toThrow(NotFoundError);
  });
});

describe('RemoverServicoUseCase', () => {
  it('remove sem OS ativa', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue(mock as any);
    vi.mocked(repo.buscarEmOSAtiva).mockResolvedValue(null);
    vi.mocked(repo.remover).mockResolvedValue({ ...mock, ativo: false } as any);
    await new RemoverServicoUseCase(repo).execute('s1');
    expect(repo.remover).toHaveBeenCalledWith('s1');
  });

  it('lança BusinessError com OS ativa', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue(mock as any);
    vi.mocked(repo.buscarEmOSAtiva).mockResolvedValue({ id: 'i1' } as any);
    await expect(new RemoverServicoUseCase(repo).execute('s1')).rejects.toThrow(BusinessError);
  });
});

describe('CalcularTempoMedioUseCase', () => {
  it('retorna null sem execuções', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue(mock as any);
    vi.mocked(repo.buscarTemposReais).mockResolvedValue([]);
    expect((await new CalcularTempoMedioUseCase(repo).execute('s1')).tempoMedio).toBeNull();
  });

  it('calcula média correta', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue(mock as any);
    vi.mocked(repo.buscarTemposReais).mockResolvedValue([
      { tempoReal: 30 },
      { tempoReal: 50 },
    ] as any);
    expect((await new CalcularTempoMedioUseCase(repo).execute('s1')).tempoMedio).toBe(40);
  });
});
