import { describe, it, expect, vi } from "vitest";
import { PecasService } from "../../src/modules/pecas/pecas.service";
import { PecasRepository } from "../../src/modules/pecas/pecas.repository";
import { ConflictError, NotFoundError, StockError } from "../../src/shared/errors";

const makeRepo = () =>
  ({
    criar: vi.fn(),
    buscarPorNome: vi.fn(),
    buscarPorId: vi.fn(),
    listar: vi.fn(),
    listarTodas: vi.fn(),
    atualizar: vi.fn(),
    incrementarEstoque: vi.fn(),
    remover: vi.fn(),
  }) as unknown as PecasRepository;

const mock = {
  id: "p1",
  nome: "Óleo",
  preco: 28,
  quantidade: 50,
  estoqueMin: 10,
  unidade: "L",
  ativo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

describe("PecasService", () => {
  describe("criar", () => {
    it("cria com sucesso", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorNome).mockResolvedValue(null);
      vi.mocked(repo.criar).mockResolvedValue(mock as any);
      const result = await new PecasService(repo).criar({
        nome: "Óleo",
        preco: 28,
        quantidade: 50,
        estoqueMin: 10,
        unidade: "L",
      });
      expect(result).toEqual(mock);
    });

    it("lança ConflictError nome duplicado", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorNome).mockResolvedValue(mock as any);
      await expect(
        new PecasService(repo).criar({
          nome: "Óleo",
          preco: 28,
          quantidade: 50,
          estoqueMin: 10,
          unidade: "L",
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("ajustarEstoque", () => {
    it("incrementa positivo", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue(mock as any);
      vi.mocked(repo.incrementarEstoque).mockResolvedValue({ ...mock, quantidade: 55 } as any);
      const result = await new PecasService(repo).ajustarEstoque("p1", { quantidade: 5 });
      expect(result.quantidade).toBe(55);
    });

    it("lança StockError saldo negativo", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue({ ...mock, quantidade: 3 } as any);
      await expect(
        new PecasService(repo).ajustarEstoque("p1", { quantidade: -10 }),
      ).rejects.toThrow(StockError);
    });
  });

  describe("alertasEstoque", () => {
    it("retorna peças abaixo do mínimo", async () => {
      const repo = makeRepo();
      vi.mocked(repo.listarTodas).mockResolvedValue([
        { id: "p1", nome: "A", quantidade: 5, estoqueMin: 10, unidade: "un" },
        { id: "p2", nome: "B", quantidade: 20, estoqueMin: 10, unidade: "un" },
      ] as any);
      const result = await new PecasService(repo).alertasEstoque();
      expect(result).toHaveLength(1);
      expect(result[0].deficit).toBe(5);
    });
  });

  describe("verificarDisponibilidade", () => {
    it("não lança se estoque suficiente", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue(mock as any);
      await expect(
        new PecasService(repo).verificarDisponibilidade("p1", 10),
      ).resolves.toBeDefined();
    });

    it("lança StockError se insuficiente", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue({ ...mock, quantidade: 2 } as any);
      await expect(new PecasService(repo).verificarDisponibilidade("p1", 10)).rejects.toThrow(
        StockError,
      );
    });
  });
});
