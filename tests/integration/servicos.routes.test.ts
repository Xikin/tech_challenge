import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let token: string;
const ADM_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const SRV_ID = "c3d4e5f6-a7b8-9012-cdef-123456789012";
const mock = {
  id: SRV_ID,
  nome: "Troca de Óleo",
  descricao: null,
  preco: 89.9,
  tempoPrevisto: 30,
  ativo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  token = app.jwt.sign({ sub: ADM_ID, email: "admin@test.com", role: "ADMIN" });
});
afterAll(async () => {
  await app.close();
});
const h = () => ({ authorization: `Bearer ${token}` });

describe("Serviços Routes", () => {
  describe("POST /servicos", () => {
    it("201 cria serviço", async () => {
      vi.mocked(prisma.servico.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.servico.create).mockResolvedValue(mock as any);
      const res = await app.inject({
        method: "POST",
        url: "/servicos",
        headers: h(),
        payload: { nome: "Troca de Óleo", preco: 89.9 },
      });
      expect(res.statusCode).toBe(201);
    });

    it("409 nome duplicado", async () => {
      vi.mocked(prisma.servico.findFirst).mockResolvedValue(mock as any);
      const res = await app.inject({
        method: "POST",
        url: "/servicos",
        headers: h(),
        payload: { nome: "Troca de Óleo", preco: 89.9 },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("GET /servicos", () => {
    it("lista paginada", async () => {
      vi.mocked(prisma.servico.findMany).mockResolvedValue([mock] as any);
      vi.mocked(prisma.servico.count).mockResolvedValue(1);
      const res = await app.inject({ method: "GET", url: "/servicos", headers: h() });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).meta.total).toBe(1);
    });
  });

  describe("GET /servicos/:id", () => {
    it("200 por ID", async () => {
      vi.mocked(prisma.servico.findFirst).mockResolvedValue(mock as any);
      const res = await app.inject({ method: "GET", url: `/servicos/${SRV_ID}`, headers: h() });
      expect(res.statusCode).toBe(200);
    });

    it("404 inexistente", async () => {
      vi.mocked(prisma.servico.findFirst).mockResolvedValue(null);
      const res = await app.inject({ method: "GET", url: `/servicos/${SRV_ID}`, headers: h() });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /servicos/:id/tempo-medio", () => {
    it("tempo médio calculado", async () => {
      vi.mocked(prisma.servico.findFirst).mockResolvedValue(mock as any);
      vi.mocked(prisma.itemServicoOS.findMany).mockResolvedValue([
        { tempoReal: 30 },
        { tempoReal: 50 },
      ] as any);
      const res = await app.inject({
        method: "GET",
        url: `/servicos/${SRV_ID}/tempo-medio`,
        headers: h(),
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).tempoMedio).toBe(40);
    });
  });

  describe("DELETE /servicos/:id", () => {
    it("204 remove serviço", async () => {
      vi.mocked(prisma.servico.findFirst).mockResolvedValue(mock as any);
      vi.mocked(prisma.itemServicoOS.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.servico.update).mockResolvedValue({ ...mock, ativo: false } as any);
      const res = await app.inject({ method: "DELETE", url: `/servicos/${SRV_ID}`, headers: h() });
      expect(res.statusCode).toBe(204);
    });

    it("400 serviço em OS ativa", async () => {
      vi.mocked(prisma.servico.findFirst).mockResolvedValue(mock as any);
      vi.mocked(prisma.itemServicoOS.findFirst).mockResolvedValue({ id: "i1" } as any);
      const res = await app.inject({ method: "DELETE", url: `/servicos/${SRV_ID}`, headers: h() });
      expect(res.statusCode).toBe(400);
    });
  });
});
