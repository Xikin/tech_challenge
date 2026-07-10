import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let token: string;
const ADM_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const PECA_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const mock = {
  id: PECA_ID,
  nome: 'Óleo',
  preco: 28,
  quantidade: 50,
  estoqueMin: 10,
  unidade: 'L',
  ativo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  token = app.jwt.sign({ sub: ADM_ID, email: 'admin@test.com', role: 'ADMIN' });
});
afterAll(async () => {
  await app.close();
});
const h = () => ({ authorization: `Bearer ${token}` });

describe('Peças Routes', () => {
  describe('POST /pecas', () => {
    it('201 cadastra peça', async () => {
      vi.mocked(prisma.peca.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.peca.create).mockResolvedValue(mock as any);
      const res = await app.inject({
        method: 'POST',
        url: '/pecas',
        headers: h(),
        payload: { nome: 'Óleo', preco: 28, quantidade: 50 },
      });
      expect(res.statusCode).toBe(201);
    });

    it('409 nome duplicado', async () => {
      vi.mocked(prisma.peca.findFirst).mockResolvedValue(mock as any);
      const res = await app.inject({
        method: 'POST',
        url: '/pecas',
        headers: h(),
        payload: { nome: 'Óleo', preco: 28 },
      });
      expect(res.statusCode).toBe(409);
    });

    it('422 preço negativo', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/pecas',
        headers: h(),
        payload: { nome: 'X', preco: -5 },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe('GET /pecas/alertas-estoque', () => {
    it('retorna peças abaixo do mínimo', async () => {
      vi.mocked(prisma.peca.findMany).mockResolvedValue([
        { ...mock, quantidade: 5, estoqueMin: 10 },
      ] as any);
      const res = await app.inject({ method: 'GET', url: '/pecas/alertas-estoque', headers: h() });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveLength(1);
      expect(body[0].deficit).toBe(5);
    });
  });

  describe('PATCH /pecas/:id/estoque', () => {
    it('200 ajusta positivo', async () => {
      vi.mocked(prisma.peca.findFirst).mockResolvedValue(mock as any);
      vi.mocked(prisma.peca.update).mockResolvedValue({ ...mock, quantidade: 55 } as any);
      const res = await app.inject({
        method: 'PATCH',
        url: `/pecas/${PECA_ID}/estoque`,
        headers: h(),
        payload: { quantidade: 5 },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).quantidade).toBe(55);
    });

    it('400 saldo negativo', async () => {
      vi.mocked(prisma.peca.findFirst).mockResolvedValue({ ...mock, quantidade: 2 } as any);
      const res = await app.inject({
        method: 'PATCH',
        url: `/pecas/${PECA_ID}/estoque`,
        headers: h(),
        payload: { quantidade: -10 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /pecas/:id', () => {
    it('204 remove peça', async () => {
      vi.mocked(prisma.peca.findFirst).mockResolvedValue(mock as any);
      vi.mocked(prisma.peca.update).mockResolvedValue({ ...mock, ativo: false } as any);
      const res = await app.inject({ method: 'DELETE', url: `/pecas/${PECA_ID}`, headers: h() });
      expect(res.statusCode).toBe(204);
    });
  });
});
