import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let token: string;
const CLI_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const mock = {
  id: CLI_ID,
  nome: "João",
  cpfCnpj: "11144477735",
  tipoPessoa: "FISICA",
  ativo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  token = app.jwt.sign({ sub: CLI_ID, email: "admin@test.com", role: "ADMIN" });
});
afterAll(async () => {
  await app.close();
});

const h = () => ({ authorization: `Bearer ${token}` });

describe("Clientes Routes", () => {
  describe("POST /clientes", () => {
    it("201 cria cliente", async () => {
      vi.mocked(prisma.cliente.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.cliente.create).mockResolvedValue(mock as any);
      const res = await app.inject({
        method: "POST",
        url: "/clientes",
        headers: h(),
        payload: { nome: "João", cpfCnpj: "111.444.777-35" },
      });
      expect(res.statusCode).toBe(201);
    });

    it("422 CPF inválido", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/clientes",
        headers: h(),
        payload: { nome: "X", cpfCnpj: "123.456.789-00" },
      });
      expect(res.statusCode).toBe(422);
    });

    it("409 CPF duplicado", async () => {
      vi.mocked(prisma.cliente.findUnique).mockResolvedValue(mock as any);
      const res = await app.inject({
        method: "POST",
        url: "/clientes",
        headers: h(),
        payload: { nome: "Jo", cpfCnpj: "111.444.777-35" },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("GET /clientes", () => {
    it("lista paginada", async () => {
      vi.mocked(prisma.cliente.findMany).mockResolvedValue([
        { ...mock, _count: { veiculos: 0, ordens: 0 } },
      ] as any);
      vi.mocked(prisma.cliente.count).mockResolvedValue(1);
      const res = await app.inject({ method: "GET", url: "/clientes", headers: h() });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).meta.total).toBe(1);
    });
  });

  describe("GET /clientes/:id", () => {
    it("200 cliente existente", async () => {
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue({
        ...mock,
        veiculos: [],
        ordens: [],
      } as any);
      const res = await app.inject({ method: "GET", url: `/clientes/${CLI_ID}`, headers: h() });
      expect(res.statusCode).toBe(200);
    });

    it("404 inexistente", async () => {
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue(null);
      const res = await app.inject({ method: "GET", url: `/clientes/${CLI_ID}`, headers: h() });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("DELETE /clientes/:id", () => {
    it("204 soft delete", async () => {
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue({
        ...mock,
        veiculos: [],
        ordens: [],
      } as any);
      vi.mocked(prisma.cliente.update).mockResolvedValue({ ...mock, ativo: false } as any);
      const res = await app.inject({ method: "DELETE", url: `/clientes/${CLI_ID}`, headers: h() });
      expect(res.statusCode).toBe(204);
    });
  });
});
