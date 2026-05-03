import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let token: string;
const ADM_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const CLI_ID = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
const VEI_ID = "c3d4e5f6-a7b8-9012-cdef-123456789012";
const mock = {
  id: VEI_ID,
  placa: "ABC1234",
  marca: "Toyota",
  modelo: "Corolla",
  ano: 2020,
  cor: null,
  clienteId: CLI_ID,
  ativo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
  cliente: { id: CLI_ID, nome: "João", cpfCnpj: "11144477735" },
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

describe("Veículos Routes", () => {
  describe("POST /veiculos", () => {
    it("201 cadastra veículo", async () => {
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue({ id: CLI_ID } as any);
      vi.mocked(prisma.veiculo.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.veiculo.create).mockResolvedValue(mock as any);
      const res = await app.inject({
        method: "POST",
        url: "/veiculos",
        headers: h(),
        payload: {
          clienteId: CLI_ID,
          placa: "ABC-1234",
          marca: "Toyota",
          modelo: "Corolla",
          ano: 2020,
        },
      });
      expect(res.statusCode).toBe(201);
    });

    it("422 placa inválida", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/veiculos",
        headers: h(),
        payload: {
          clienteId: CLI_ID,
          placa: "INVALIDA",
          marca: "Toyota",
          modelo: "Corolla",
          ano: 2020,
        },
      });
      expect(res.statusCode).toBe(422);
    });

    it("409 placa duplicada", async () => {
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue({ id: CLI_ID } as any);
      vi.mocked(prisma.veiculo.findUnique).mockResolvedValue(mock as any);
      const res = await app.inject({
        method: "POST",
        url: "/veiculos",
        headers: h(),
        payload: {
          clienteId: CLI_ID,
          placa: "ABC1234",
          marca: "Toyota",
          modelo: "Corolla",
          ano: 2020,
        },
      });
      expect(res.statusCode).toBe(409);
    });

    it("404 cliente inexistente", async () => {
      vi.mocked(prisma.cliente.findFirst).mockResolvedValue(null);
      const res = await app.inject({
        method: "POST",
        url: "/veiculos",
        headers: h(),
        payload: { clienteId: CLI_ID, placa: "XYZ9999", marca: "Ford", modelo: "Ka", ano: 2021 },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /veiculos", () => {
    it("lista veículos", async () => {
      vi.mocked(prisma.veiculo.findMany).mockResolvedValue([mock] as any);
      const res = await app.inject({ method: "GET", url: "/veiculos", headers: h() });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toHaveLength(1);
    });
  });

  describe("GET /veiculos/placa/:placa", () => {
    it("200 por placa", async () => {
      vi.mocked(prisma.veiculo.findFirst).mockResolvedValue({ ...mock, cliente: {} } as any);
      const res = await app.inject({ method: "GET", url: "/veiculos/placa/ABC1234", headers: h() });
      expect(res.statusCode).toBe(200);
    });

    it("404 placa não encontrada", async () => {
      vi.mocked(prisma.veiculo.findFirst).mockResolvedValue(null);
      const res = await app.inject({ method: "GET", url: "/veiculos/placa/ZZZ9999", headers: h() });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /veiculos/:id", () => {
    it("200 por ID", async () => {
      vi.mocked(prisma.veiculo.findFirst).mockResolvedValue({
        ...mock,
        cliente: {},
        ordens: [],
      } as any);
      const res = await app.inject({ method: "GET", url: `/veiculos/${VEI_ID}`, headers: h() });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("DELETE /veiculos/:id", () => {
    it("204 remove veículo", async () => {
      vi.mocked(prisma.veiculo.findFirst).mockResolvedValue({
        ...mock,
        cliente: {},
        ordens: [],
      } as any);
      vi.mocked(prisma.veiculo.update).mockResolvedValue({ ...mock, ativo: false } as any);
      const res = await app.inject({ method: "DELETE", url: `/veiculos/${VEI_ID}`, headers: h() });
      expect(res.statusCode).toBe(204);
    });
  });
});
