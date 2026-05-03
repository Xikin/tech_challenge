import { describe, it, expect, vi } from "vitest";
import { OrdensService } from "../../src/modules/ordens/ordens.service";
import { OrdensRepository } from "../../src/modules/ordens/ordens.repository";
import { NotFoundError, BusinessError, StockError } from "../../src/shared/errors";

const OS_ID = "d4e5f6a7-b8c9-0123-defa-234567890123";
const CLI_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const VEI_ID = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
const SRV_ID = "c3d4e5f6-a7b8-9012-cdef-123456789012";

const mockOS = {
  id: OS_ID,
  numero: 1,
  clienteId: CLI_ID,
  veiculoId: VEI_ID,
  status: "RECEBIDA",
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
      id: "i1",
      ordemId: OS_ID,
      servicoId: SRV_ID,
      preco: 89.9,
      tempoReal: null,
      servico: { id: SRV_ID, nome: "Óleo", preco: 89.9 },
    },
  ],
  pecas: [],
  historico: [],
};

const makeRepo = () =>
  ({
    buscarPorId: vi.fn(),
    buscarPorNumero: vi.fn(),
    buscarStatusPublico: vi.fn(),
    listar: vi.fn(),
    criar: vi.fn(),
    atualizar: vi.fn(),
    avancarStatus: vi.fn(),
    reprovar: vi.fn(),
    cancelar: vi.fn(),
    adicionarItens: vi.fn(),
    buscarServico: vi.fn(),
    buscarPeca: vi.fn(),
    buscarCliente: vi.fn(),
    buscarVeiculo: vi.fn(),
  }) as unknown as OrdensRepository;

describe("OrdensService", () => {
  describe("buscarPorId", () => {
    it("retorna OS existente", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue(mockOS as any);
      expect((await new OrdensService(repo).buscarPorId(OS_ID)).id).toBe(OS_ID);
    });

    it("lança NotFoundError", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue(null);
      await expect(new OrdensService(repo).buscarPorId(OS_ID)).rejects.toThrow(NotFoundError);
    });
  });

  describe("avancarStatus — máquina de estados", () => {
    const fluxo = [
      ["RECEBIDA", "EM_DIAGNOSTICO"],
      ["EM_DIAGNOSTICO", "AGUARDANDO_APROVACAO"],
      ["AGUARDANDO_APROVACAO", "EM_EXECUCAO"],
      ["EM_EXECUCAO", "FINALIZADA"],
      ["FINALIZADA", "ENTREGUE"],
    ];

    fluxo.forEach(([de, para]) => {
      it(`${de} → ${para}`, async () => {
        const repo = makeRepo();
        vi.mocked(repo.buscarPorId)
          .mockResolvedValueOnce({ ...mockOS, status: de } as any)
          .mockResolvedValueOnce({ ...mockOS, status: para } as any);
        vi.mocked(repo.avancarStatus).mockResolvedValue(undefined);
        await new OrdensService(repo).avancarStatus(OS_ID, {});
        expect(repo.avancarStatus).toHaveBeenCalledWith(
          expect.objectContaining({ novoStatus: para }),
        );
      });
    });

    it("lança BusinessError em ENTREGUE", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue({ ...mockOS, status: "ENTREGUE" } as any);
      await expect(new OrdensService(repo).avancarStatus(OS_ID, {})).rejects.toThrow(BusinessError);
    });
  });

  describe("reprovarOS", () => {
    it("reprova e devolve peças", async () => {
      const repo = makeRepo();
      const osAg = {
        ...mockOS,
        status: "AGUARDANDO_APROVACAO",
        pecas: [{ pecaId: "p1", quantidade: 2 }],
      };
      vi.mocked(repo.buscarPorId)
        .mockResolvedValueOnce(osAg as any)
        .mockResolvedValueOnce({ ...osAg, status: "EM_DIAGNOSTICO" } as any);
      vi.mocked(repo.reprovar).mockResolvedValue(undefined);
      await new OrdensService(repo).reprovarOS(OS_ID, "Caro");
      expect(repo.reprovar).toHaveBeenCalledWith(expect.objectContaining({ id: OS_ID }));
    });

    it("lança BusinessError se não aguardando", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue({ ...mockOS, status: "RECEBIDA" } as any);
      await expect(new OrdensService(repo).reprovarOS(OS_ID)).rejects.toThrow(BusinessError);
    });
  });

  describe("criar", () => {
    it("lança NotFoundError cliente inexistente", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarCliente).mockResolvedValue(null);
      await expect(
        new OrdensService(repo).criar({
          clienteId: CLI_ID,
          veiculoId: VEI_ID,
          servicos: [{ servicoId: SRV_ID }],
          pecas: [],
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("lança NotFoundError veículo inexistente", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarCliente).mockResolvedValue({ id: CLI_ID } as any);
      vi.mocked(repo.buscarVeiculo).mockResolvedValue(null);
      await expect(
        new OrdensService(repo).criar({
          clienteId: CLI_ID,
          veiculoId: VEI_ID,
          servicos: [{ servicoId: SRV_ID }],
          pecas: [],
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("lança StockError peça sem estoque", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarCliente).mockResolvedValue({ id: CLI_ID } as any);
      vi.mocked(repo.buscarVeiculo).mockResolvedValue({ id: VEI_ID } as any);
      vi.mocked(repo.buscarServico).mockResolvedValue({ id: SRV_ID, preco: 89.9 } as any);
      vi.mocked(repo.buscarPeca).mockResolvedValue({
        id: "p1",
        nome: "Filtro",
        preco: 22,
        quantidade: 1,
      } as any);
      await expect(
        new OrdensService(repo).criar({
          clienteId: CLI_ID,
          veiculoId: VEI_ID,
          servicos: [{ servicoId: SRV_ID }],
          pecas: [{ pecaId: "p1", quantidade: 5 }],
        }),
      ).rejects.toThrow(StockError);
    });
  });

  describe("atualizar", () => {
    it("lança BusinessError OS finalizada", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarPorId).mockResolvedValue({ ...mockOS, status: "FINALIZADA" } as any);
      await expect(new OrdensService(repo).atualizar(OS_ID, { descricao: "X" })).rejects.toThrow(
        BusinessError,
      );
    });
  });

  describe("consultarStatusPublico", () => {
    it("retorna statusLabel", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarStatusPublico).mockResolvedValue({
        ...mockOS,
        status: "RECEBIDA",
        servicos: [],
        historico: [],
        veiculo: { placa: "ABC1234", marca: "Toyota", modelo: "Corolla" },
      } as any);
      const result = await new OrdensService(repo).consultarStatusPublico(1, "11144477735");
      expect(result.statusLabel).toBe("Recebida");
    });

    it("lança NotFoundError", async () => {
      const repo = makeRepo();
      vi.mocked(repo.buscarStatusPublico).mockResolvedValue(null);
      await expect(new OrdensService(repo).consultarStatusPublico(999, "0")).rejects.toThrow(
        NotFoundError,
      );
    });
  });
});

describe("cancelarOS", () => {
  it("cancela OS recebida e devolve peças", async () => {
    const repo = makeRepo();
    const osComPecas = { ...mockOS, status: "RECEBIDA", pecas: [{ pecaId: "p1", quantidade: 2 }] };
    vi.mocked(repo.buscarPorId)
      .mockResolvedValueOnce(osComPecas as any)
      .mockResolvedValueOnce({ ...osComPecas, status: "CANCELADA" } as any);
    vi.mocked(repo.cancelar).mockResolvedValue(undefined);

    const result = await new OrdensService(repo).cancelarOS(OS_ID, "Cliente desistiu");

    expect(repo.cancelar).toHaveBeenCalledWith(
      expect.objectContaining({
        id: OS_ID,
        statusAnterior: "RECEBIDA",
        motivo: "Cliente desistiu",
        pecas: [{ pecaId: "p1", quantidade: 2 }],
      }),
    );
    expect(result.status).toBe("CANCELADA");
  });

  it("cancela OS em execução", async () => {
    const repo = makeRepo();
    const osExecucao = { ...mockOS, status: "EM_EXECUCAO", pecas: [] };
    vi.mocked(repo.buscarPorId)
      .mockResolvedValueOnce(osExecucao as any)
      .mockResolvedValueOnce({ ...osExecucao, status: "CANCELADA" } as any);
    vi.mocked(repo.cancelar).mockResolvedValue(undefined);

    const result = await new OrdensService(repo).cancelarOS(OS_ID);
    expect(repo.cancelar).toHaveBeenCalled();
    expect(result.status).toBe("CANCELADA");
  });

  it("lança BusinessError ao cancelar OS finalizada", async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue({ ...mockOS, status: "FINALIZADA" } as any);

    await expect(new OrdensService(repo).cancelarOS(OS_ID)).rejects.toThrow(BusinessError);
  });

  it("lança BusinessError ao cancelar OS entregue", async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue({ ...mockOS, status: "ENTREGUE" } as any);

    await expect(new OrdensService(repo).cancelarOS(OS_ID)).rejects.toThrow(BusinessError);
  });

  it("lança BusinessError ao cancelar OS já cancelada", async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue({ ...mockOS, status: "CANCELADA" } as any);

    await expect(new OrdensService(repo).cancelarOS(OS_ID)).rejects.toThrow(BusinessError);
  });
});
