import { describe, it, expect, vi } from 'vitest';
import type Redis from 'ioredis';
import { RedisCache } from '../../src/infrastructure/cache/redis-cache';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function redisFalso() {
  const dados = new Map<string, string>();
  return {
    dados,
    cliente: {
      get: vi.fn(async (k: string) => dados.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        dados.set(k, v);
        return 'OK';
      }),
      del: vi.fn(async (k: string) => (dados.delete(k) ? 1 : 0)),
    } as unknown as Redis,
  };
}

describe('RedisCache', () => {
  it('grava com TTL e lê de volta reconstruindo datas', async () => {
    const { cliente } = redisFalso();
    const cache = new RedisCache(cliente, logger);
    const criadoEm = new Date('2026-11-10T12:00:00.000Z');

    await cache.definir('k', { criadoEm, nome: '2026 não é data' }, 60);
    const lido = await cache.obter<{ criadoEm: Date; nome: string }>('k');

    expect(cliente.set).toHaveBeenCalledWith('k', expect.any(String), 'EX', 60);
    expect(lido?.criadoEm).toBeInstanceOf(Date);
    expect(lido?.criadoEm.toISOString()).toBe('2026-11-10T12:00:00.000Z');
    expect(lido?.nome).toBe('2026 não é data');
  });

  it('retorna null para chave ausente e remove chaves', async () => {
    const { cliente, dados } = redisFalso();
    const cache = new RedisCache(cliente, logger);
    expect(await cache.obter('nada')).toBeNull();
    dados.set('x', '1');
    await cache.remover('x');
    expect(dados.has('x')).toBe(false);
  });

  it('com Redis fora do ar se comporta como cache vazio e registra a falha', async () => {
    const quebrado = {
      get: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      set: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      del: vi.fn().mockRejectedValue('texto'),
    } as unknown as Redis;
    const cache = new RedisCache(quebrado, logger);

    expect(await cache.obter('k')).toBeNull();
    await cache.definir('k', 1, 1);
    await cache.remover('k');

    expect(logger.warn).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ integracao: 'redis', operacao: 'obter', erro: 'ECONNREFUSED' }),
      expect.any(String),
    );
  });
});
