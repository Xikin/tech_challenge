import { describe, it, expect, vi } from "vitest";
import { ClientesService } from "../../src/modules/clientes/clientes.service";
import { ClientesRepository } from "../../src/modules/clientes/clientes.repository";
import { ConflictError, NotFoundError } from "../../src/shared/errors";

const makeRepo = () =>
  ({
    criar: vi.fn(),
    buscarPorCpfCnpj: vi.fn(),
    buscarPorId: vi.fn(),
    listar: vi.fn(),
    atualizar: vi.fn(),
    remover: vi.fn(),
  }) as unknown as ClientesRepository;

const mockCliente = {
  id: "uuid-1",
  nome: "João",
  cpfCnpj: "11144477735",
  tipoPessoa: "FISICA",
  ativo: true,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

describe("ClientesService", () => {
  describe("criar", () => {
    it("cria com sucesso", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorCpfCnpj).mockResolvedValue(null);
      vi.mocked(repo.criar).mockResolvedValue(mockCliente as any);
      const svc = new ClientesService(repo);
      const result = await svc.criar({ nome: "João", cpfCnpj: "11144477735" });
      expect(result).toEqual(mockCliente);
    });

    it("lança ConflictError se CPF duplicado", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorCpfCnpj).mockResolvedValue(mockCliente as any);
      await expect(
        new ClientesService(repo).criar({ nome: "João", cpfCnpj: "11144477735" }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("buscarPorId", () => {
    it("retorna cliente existente", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue({
        ...mockCliente,
        veiculos: [],
        ordens: [],
      } as any);
      const result = await new ClientesService(repo).buscarPorId("uuid-1");
      expect(result.id).toBe("uuid-1");
    });

    it("lança NotFoundError", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue(null);
      await expect(new ClientesService(repo).buscarPorId("x")).rejects.toThrow(NotFoundError);
    });
  });

  describe("listar", () => {
    it("retorna paginação correta", async () => {
      const repo = makeRepo();
      vi.mocked(repo.listar).mockResolvedValue({ data: [mockCliente as any], total: 1 });
      const result = await new ClientesService(repo).listar({ page: 1, limit: 20 });
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe("atualizar", () => {
    it("atualiza com sucesso", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue({
        ...mockCliente,
        veiculos: [],
        ordens: [],
      } as any);
      vi.mocked(repo.atualizar).mockResolvedValue({ ...mockCliente, nome: "Novo" } as any);
      const result = await new ClientesService(repo).atualizar("uuid-1", { nome: "Novo" });
      expect(result.nome).toBe("Novo");
    });

    it("lança NotFoundError se não existe", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue(null);
      await expect(new ClientesService(repo).atualizar("x", { nome: "X" })).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("remover", () => {
    it("soft delete", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue({
        ...mockCliente,
        veiculos: [],
        ordens: [],
      } as any);
      vi.mocked(repo.remover).mockResolvedValue({ ...mockCliente, ativo: false } as any);
      await new ClientesService(repo).remover("uuid-1");
      expect(repo.remover).toHaveBeenCalledWith("uuid-1");
    });
  });
});
