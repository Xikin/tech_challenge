import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const ADM_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const mockAdmin = {
  id: ADM_ID,
  nome: "Admin",
  email: "admin@test.com",
  role: "ADMIN",
  ativo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
  senha: "",
};

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe("Auth Routes", () => {
  describe("POST /auth/login", () => {
    it("retorna token com credenciais válidas", async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue({
        ...mockAdmin,
        senha: await bcrypt.hash("Abc@1234", 1),
      } as any);
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "admin@test.com", senha: "Abc@1234" },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).token).toBeDefined();
    });

    it("401 senha incorreta", async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue({
        ...mockAdmin,
        senha: await bcrypt.hash("Abc@1234", 1),
      } as any);
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "admin@test.com", senha: "Errada@1" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("401 usuário inexistente", async () => {
      vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "x@x.com", senha: "Abc@1234" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /health", () => {
    it("retorna ok", async () => {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).status).toBe("ok");
    });
  });

  describe("Rotas protegidas", () => {
    it("401 sem token em /clientes", async () => {
      expect((await app.inject({ method: "GET", url: "/clientes" })).statusCode).toBe(401);
    });
    it("401 sem token em /ordens", async () => {
      expect((await app.inject({ method: "GET", url: "/ordens" })).statusCode).toBe(401);
    });
  });

  describe("GET /auth/me", () => {
    it("retorna user autenticado", async () => {
      const token = app.jwt.sign({ sub: ADM_ID, email: "admin@test.com", role: "ADMIN" });
      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("POST /auth/usuarios", () => {
    it("403 para FUNCIONARIO", async () => {
      const token = app.jwt.sign({ sub: ADM_ID, email: "f@test.com", role: "FUNCIONARIO" });
      const res = await app.inject({
        method: "POST",
        url: "/auth/usuarios",
        headers: { authorization: `Bearer ${token}` },
        payload: { nome: "X", email: "x@x.com", senha: "Abc@1234" },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
