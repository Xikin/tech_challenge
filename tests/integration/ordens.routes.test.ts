import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/config/prisma";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let token: string;

const CLI_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const VEI_ID = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
const OS_ID = "d4e5f6a7-b8c9-0123-defa-234567890123";
const SRV_ID = "c3d4e5f6-a7b8-9012-cdef-123456789012";
const ITEM_SRV_ID = "f6a7b8c9-d0e1-2345-fabc-456789012345";
const HIST_ID = "e5f6a7b8-c9d0-1234-efab-345678901234";

const mockOS = {
  id: OS_ID,
  numero: 1,
  clienteId: CLI_ID,
  veiculoId: VEI_ID,
  status: "RECEBIDA",
  descricao: null,
  observacoes: null,
  valorTotal: 89.9,
  aprovadoEm: null,
  iniciadoEm: null,
  finalizadoEm: null,
  entregueEm: null,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
  cliente: { id: CLI_ID, nome: "João", cpfCnpj: "11144477735", email: null, telefone: null },
  veiculo: {
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
  },
  servicos: [
    {
      id: ITEM_SRV_ID,
      ordemId: OS_ID,
      servicoId: SRV_ID,
      preco: 89.9,
      tempoReal: null,
      servico: {
        id: SRV_ID,
        nome: "Óleo",
        descricao: null,
        preco: 89.9,
        tempoPrevisto: null,
        ativo: true,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      },
    },
  ],
  pecas: [],
  historico: [{ id: HIST_ID, ordemId: OS_ID, statusAnterior: null, statusNovo: "RECEBIDA", observacao: "Criada", criadoEm: new Date() }],
  _count: { servicos: 1, pecas: 0 },
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

describe("Ordens Routes", () => {
  describe("GET /ordens/consulta-publica", () => {
    it("200 sem autenticação", async () => {
      vi.mocked(prisma.ordemServico.findFirst).mockResolvedValue({
        ...mockOS,
        servicos: [{ servico: { nome: "Óleo" }, preco: 89.9 }],
        historico: [{ statusNovo: "RECEBIDA", observacao: null, criadoEm: new Date() }],
        veiculo: { placa: "ABC1234", marca: "Toyota", modelo: "Corolla" },
      } as any);
      const res = await app.inject({
        method: "GET",
        url: "/ordens/consulta-publica?numero=1&cpfCnpj=11144477735",
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).statusLabel).toBe("Recebida");
    });

    it("404 OS não encontrada", async () => {
      vi.mocked(prisma.ordemServico.findFirst).mockResolvedValue(null);
      const res = await app.inject({
        method: "GET",
        url: "/ordens/consulta-publica?numero=999&cpfCnpj=0",
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /ordens", () => {
    it("lista autenticado", async () => {
      vi.mocked(prisma.ordemServico.findMany).mockResolvedValue([mockOS] as any);
      vi.mocked(prisma.ordemServico.count).mockResolvedValue(1);
      const res = await app.inject({ method: "GET", url: "/ordens", headers: h() });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).meta.total).toBe(1);
    });

    it("401 sem token", async () => {
      expect((await app.inject({ method: "GET", url: "/ordens" })).statusCode).toBe(401);
    });
  });

  describe("GET /ordens/:id", () => {
    it("200 por ID", async () => {
      vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(mockOS as any);
      const res = await app.inject({ method: "GET", url: `/ordens/${OS_ID}`, headers: h() });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).id).toBe(OS_ID);
    });

    it("404 inexistente", async () => {
      vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(null);
      const res = await app.inject({ method: "GET", url: `/ordens/${OS_ID}`, headers: h() });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /ordens/numero/:numero", () => {
    it("200 por número", async () => {
      vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue(mockOS as any);
      const res = await app.inject({ method: "GET", url: "/ordens/numero/1", headers: h() });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("PATCH /ordens/:id/avancar", () => {
    it("avança RECEBIDA → EM_DIAGNOSTICO", async () => {
      vi.mocked(prisma.ordemServico.findUnique)
        .mockResolvedValueOnce(mockOS as any)
        .mockResolvedValueOnce({ ...mockOS, status: "EM_DIAGNOSTICO" } as any);
      vi.mocked(prisma.ordemServico.update).mockResolvedValue({} as any);
      vi.mocked(prisma.historicoOS.create).mockResolvedValue({} as any);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
        fn({
          ordemServico: { update: vi.fn() },
          historicoOS: { create: vi.fn() },
          itemServicoOS: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
          peca: { update: vi.fn() },
        }),
      );
      const res = await app.inject({
        method: "PATCH",
        url: `/ordens/${OS_ID}/avancar`,
        headers: h(),
        payload: {},
      });
      expect(res.statusCode).toBe(200);
    });

    it("400 OS já entregue", async () => {
      vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue({
        ...mockOS,
        status: "ENTREGUE",
      } as any);
      const res = await app.inject({
        method: "PATCH",
        url: `/ordens/${OS_ID}/avancar`,
        headers: h(),
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("PATCH /ordens/:id/reprovar", () => {
    it("reprova orçamento", async () => {
      const osAg = { ...mockOS, status: "AGUARDANDO_APROVACAO" };
      vi.mocked(prisma.ordemServico.findUnique)
        .mockResolvedValueOnce(osAg as any)
        .mockResolvedValueOnce({ ...osAg, status: "EM_DIAGNOSTICO" } as any);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
        fn({
          peca: { update: vi.fn() },
          ordemServico: { update: vi.fn() },
          historicoOS: { create: vi.fn() },
        }),
      );
      const res = await app.inject({
        method: "PATCH",
        url: `/ordens/${OS_ID}/reprovar`,
        headers: h(),
        payload: { observacao: "Caro" },
      });
      expect(res.statusCode).toBe(200);
    });

    it("400 status inválido", async () => {
      vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue({
        ...mockOS,
        status: "RECEBIDA",
      } as any);
      const res = await app.inject({
        method: "PATCH",
        url: `/ordens/${OS_ID}/reprovar`,
        headers: h(),
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("PUT /ordens/:id", () => {
    it("400 OS finalizada", async () => {
      vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue({
        ...mockOS,
        status: "FINALIZADA",
      } as any);
      const res = await app.inject({
        method: "PUT",
        url: `/ordens/${OS_ID}`,
        headers: h(),
        payload: { descricao: "X" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("200 atualiza OS editável", async () => {
      vi.mocked(prisma.ordemServico.findUnique)
        .mockResolvedValueOnce(mockOS as any)
        .mockResolvedValueOnce({ ...mockOS, descricao: "Nova desc" } as any);
      vi.mocked(prisma.ordemServico.update).mockResolvedValue({
        ...mockOS,
        descricao: "Nova desc",
      } as any);
      const res = await app.inject({
        method: "PUT",
        url: `/ordens/${OS_ID}`,
        headers: h(),
        payload: { descricao: "Nova desc" },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});

describe("PATCH /ordens/:id/cancelar", () => {
  it("200 cancela OS recebida", async () => {
    const osRecebida = { ...mockOS, status: "RECEBIDA" };
    vi.mocked(prisma.ordemServico.findUnique)
      .mockResolvedValueOnce(osRecebida as any)
      .mockResolvedValueOnce({ ...osRecebida, status: "CANCELADA" } as any);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
      fn({
        peca: { update: vi.fn() },
        ordemServico: { update: vi.fn() },
        historicoOS: { create: vi.fn() },
      }),
    );

    const res = await app.inject({
      method: "PATCH",
      url: `/ordens/${OS_ID}/cancelar`,
      headers: h(),
      payload: { motivo: "Cliente desistiu" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe("CANCELADA");
  });

  it("400 não pode cancelar OS finalizada", async () => {
    vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue({
      ...mockOS,
      status: "FINALIZADA",
    } as any);

    const res = await app.inject({
      method: "PATCH",
      url: `/ordens/${OS_ID}/cancelar`,
      headers: h(),
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it("400 não pode cancelar OS entregue", async () => {
    vi.mocked(prisma.ordemServico.findUnique).mockResolvedValue({
      ...mockOS,
      status: "ENTREGUE",
    } as any);

    const res = await app.inject({
      method: "PATCH",
      url: `/ordens/${OS_ID}/cancelar`,
      headers: h(),
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it("401 sem autenticação", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/ordens/${OS_ID}/cancelar`,
      payload: {},
    });

    expect(res.statusCode).toBe(401);
  });
});
