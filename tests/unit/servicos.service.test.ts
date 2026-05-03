import { describe, it, expect, vi } from "vitest";
import { ServicosService } from "../../src/modules/servicos/servicos.service";
import { ServicosRepository } from "../../src/modules/servicos/servicos.repository";
import { ConflictError, NotFoundError, BusinessError } from "../../src/shared/errors";

const makeRepo = () =>
  ({
    criar: vi.fn(),
    buscarPorNome: vi.fn(),
    buscarPorId: vi.fn(),
    listar: vi.fn(),
    atualizar: vi.fn(),
    remover: vi.fn(),
    buscarEmOSAtiva: vi.fn(),
    buscarTemposReais: vi.fn(),
  }) as unknown as ServicosRepository;

const mock = {
  id: "s1",
  nome: "Troca de Óleo",
  preco: 89.9,
  tempoPrevisto: 30,
  ativo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

describe("ServicosService", () => {
  describe("criar", () => {
    it("cria com sucesso", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorNome).mockResolvedValue(null);
      vi.mocked(repo.criar).mockResolvedValue(mock as any);
      expect(await new ServicosService(repo).criar({ nome: "Troca de Óleo", preco: 89.9 })).toEqual(
        mock,
      );
    });

    it("lança ConflictError nome duplicado", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorNome).mockResolvedValue(mock as any);
      await expect(
        new ServicosService(repo).criar({ nome: "Troca de Óleo", preco: 89.9 }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("buscarPorId", () => {
    it("retorna serviço", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue(mock as any);
      expect((await new ServicosService(repo).buscarPorId("s1")).id).toBe("s1");
    });

    it("lança NotFoundError", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue(null);
      await expect(new ServicosService(repo).buscarPorId("x")).rejects.toThrow(NotFoundError);
    });
  });

  describe("remover", () => {
    it("remove sem OS ativa", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue(mock as any);
      vi.mocked(repo.buscarEmOSAtiva).mockResolvedValue(null);
      vi.mocked(repo.remover).mockResolvedValue({ ...mock, ativo: false } as any);
      await new ServicosService(repo).remover("s1");
      expect(repo.remover).toHaveBeenCalledWith("s1");
    });

    it("lança BusinessError com OS ativa", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue(mock as any);
      vi.mocked(repo.buscarEmOSAtiva).mockResolvedValue({ id: "i1" } as any);
      await expect(new ServicosService(repo).remover("s1")).rejects.toThrow(BusinessError);
    });
  });

  describe("calcularTempoMedio", () => {
    it("retorna null sem execuções", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue(mock as any);
      vi.mocked(repo.buscarTemposReais).mockResolvedValue([]);
      expect((await new ServicosService(repo).calcularTempoMedio("s1")).tempoMedio).toBeNull();
    });

    it("calcula média correta", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue(mock as any);
      vi.mocked(repo.buscarTemposReais).mockResolvedValue([
        { tempoReal: 30 },
        { tempoReal: 50 },
      ] as any);
      expect((await new ServicosService(repo).calcularTempoMedio("s1")).tempoMedio).toBe(40);
    });
  });
});
