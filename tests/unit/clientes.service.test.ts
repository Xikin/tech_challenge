import { describe, it, expect, vi } from 'vitest';
import { CriarClienteUseCase } from '../../src/application/use-cases/clientes/criar-cliente.use-case';
import { BuscarClientePorIdUseCase } from '../../src/application/use-cases/clientes/buscar-cliente-por-id.use-case';
import { ListarClientesUseCase } from '../../src/application/use-cases/clientes/listar-clientes.use-case';
import { AtualizarClienteUseCase } from '../../src/application/use-cases/clientes/atualizar-cliente.use-case';
import { RemoverClienteUseCase } from '../../src/application/use-cases/clientes/remover-cliente.use-case';
import type { IClienteRepository } from '../../src/domain/repositories/clientes.repository.interface';
import { ConflictError, NotFoundError } from '../../src/shared/errors';

const makeRepo = () =>
  ({
    criar: vi.fn(),
    buscarPorCpfCnpj: vi.fn(),
    buscarPorId: vi.fn(),
    listar: vi.fn(),
    atualizar: vi.fn(),
    remover: vi.fn(),
  }) as unknown as IClienteRepository;

const mockCliente = {
  id: 'uuid-1',
  nome: 'João',
  cpfCnpj: '11144477735',
  tipoPessoa: 'FISICA',
  ativo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

describe('CriarClienteUseCase', () => {
  it('cria com sucesso', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorCpfCnpj).mockResolvedValue(null);
    vi.mocked(repo.criar).mockResolvedValue(mockCliente as any);
    const result = await new CriarClienteUseCase(repo).execute({
      nome: 'João',
      cpfCnpj: '11144477735',
    });
    expect(result).toEqual(mockCliente);
  });

  it('lança ConflictError se CPF duplicado', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorCpfCnpj).mockResolvedValue(mockCliente as any);
    await expect(
      new CriarClienteUseCase(repo).execute({ nome: 'João', cpfCnpj: '11144477735' }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('BuscarClientePorIdUseCase', () => {
  it('retorna cliente existente', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue({
      ...mockCliente,
      veiculos: [],
      ordens: [],
    } as any);
    const result = await new BuscarClientePorIdUseCase(repo).execute('uuid-1');
    expect(result.id).toBe('uuid-1');
  });

  it('lança NotFoundError', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue(null);
    await expect(new BuscarClientePorIdUseCase(repo).execute('x')).rejects.toThrow(NotFoundError);
  });
});

describe('ListarClientesUseCase', () => {
  it('retorna paginação correta', async () => {
    const repo = makeRepo();
    vi.mocked(repo.listar).mockResolvedValue({ data: [mockCliente as any], total: 1 });
    const result = await new ListarClientesUseCase(repo).execute({ page: 1, limit: 20 });
    expect(result.meta.total).toBe(1);
    expect(result.meta.totalPages).toBe(1);
  });
});

describe('AtualizarClienteUseCase', () => {
  it('atualiza com sucesso', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue({
      ...mockCliente,
      veiculos: [],
      ordens: [],
    } as any);
    vi.mocked(repo.atualizar).mockResolvedValue({ ...mockCliente, nome: 'Novo' } as any);
    const result = await new AtualizarClienteUseCase(repo).execute('uuid-1', { nome: 'Novo' });
    expect(result.nome).toBe('Novo');
  });

  it('lança NotFoundError se não existe', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue(null);
    await expect(new AtualizarClienteUseCase(repo).execute('x', { nome: 'X' })).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe('RemoverClienteUseCase', () => {
  it('soft delete', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue({
      ...mockCliente,
      veiculos: [],
      ordens: [],
    } as any);
    vi.mocked(repo.remover).mockResolvedValue({ ...mockCliente, ativo: false } as any);
    await new RemoverClienteUseCase(repo).execute('uuid-1');
    expect(repo.remover).toHaveBeenCalledWith('uuid-1');
  });
});
