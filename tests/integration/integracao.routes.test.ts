import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

const CHAVE = 'chave-de-integracao-com-mais-de-32-caracteres';
process.env.INTEGRACAO_API_KEY = CHAVE;

const { buildApp } = await import('../../src/app');
const { prisma } = await import('../../src/config/prisma');

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  delete process.env.INTEGRACAO_API_KEY;
});

const identificar = (cabecalhos: Record<string, string>, cpf = '529.982.247-25') =>
  app.inject({
    method: 'POST',
    url: '/integracao/clientes/identificar',
    headers: cabecalhos,
    payload: { cpf },
  });

describe('POST /integracao/clientes/identificar', () => {
  it('200 devolve apenas os dados de que a Lambda precisa', async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue({
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      nome: 'Ana',
      cpfCnpj: '52998224725',
      tipoPessoa: 'FISICA',
      email: 'ana@x.com',
      telefone: '11999999999',
      ativo: true,
    } as never);

    const res = await identificar({ 'x-api-key': CHAVE });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      nome: 'Ana',
      email: 'ana@x.com',
      ativo: true,
    });
    expect(prisma.cliente.findUnique).toHaveBeenCalledWith({ where: { cpfCnpj: '52998224725' } });
  });

  it('404 para CNPJ ou cliente inexistente', async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValueOnce({
      tipoPessoa: 'JURIDICA',
    } as never);
    expect((await identificar({ 'x-api-key': CHAVE })).statusCode).toBe(404);

    vi.mocked(prisma.cliente.findUnique).mockResolvedValueOnce(null);
    expect((await identificar({ 'x-api-key': CHAVE })).statusCode).toBe(404);
  });

  it('401 sem chave ou com chave errada', async () => {
    expect((await identificar({})).statusCode).toBe(401);
    expect((await identificar({ 'x-api-key': 'errada' })).statusCode).toBe(401);
    expect(prisma.cliente.findUnique).not.toHaveBeenCalled();
  });
});
