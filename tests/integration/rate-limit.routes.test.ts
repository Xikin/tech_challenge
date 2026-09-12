import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';

/**
 * Limites de tentativa (ADR-0012). Os testes compartilham a mesma instância da
 * app — e portanto o mesmo contador em memória —, então a ordem importa.
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const login = (email: string) =>
  app.inject({ method: 'POST', url: '/auth/login', payload: { email, senha: 'Errada@123' } });

const consultaPublica = (numero: number) =>
  app.inject({
    method: 'GET',
    url: `/ordens/consulta-publica?numero=${numero}&cpfCnpj=52998224725`,
  });

describe('rate limit do login (por e-mail)', () => {
  it('responde 429 na 6ª tentativa para o mesmo e-mail', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null as never);

    for (let i = 0; i < 5; i++) {
      expect((await login('alvo@oficina.com')).statusCode).toBe(401);
    }

    const bloqueada = await login('alvo@oficina.com');
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.json()).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
    expect(bloqueada.json().message).toMatch(/Tente novamente em 15 minuto\(s\)\./);
    expect(bloqueada.headers['retry-after']).toBeDefined();
  });

  it('não contorna o limite trocando maiúsculas e minúsculas do e-mail', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null as never);

    expect((await login('ALVO@Oficina.com')).statusCode).toBe(429);
  });

  it('não afeta outro e-mail', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null as never);

    expect((await login('outra.pessoa@oficina.com')).statusCode).toBe(401);
  });

  it('não consulta o banco quando a tentativa já foi bloqueada', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null as never);

    await login('alvo@oficina.com');

    expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
  });
});

describe('rate limit da consulta pública (por número da OS)', () => {
  it('responde 429 na 11ª consulta à mesma OS', async () => {
    vi.mocked(prisma.ordemServico.findFirst).mockResolvedValue(null as never);

    for (let i = 0; i < 10; i++) {
      expect((await consultaPublica(777)).statusCode).toBe(404);
    }

    const bloqueada = await consultaPublica(777);
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.json().code).toBe('RATE_LIMITED');
  });

  it('não afeta a consulta de outra OS', async () => {
    vi.mocked(prisma.ordemServico.findFirst).mockResolvedValue(null as never);

    expect((await consultaPublica(778)).statusCode).toBe(404);
  });
});
