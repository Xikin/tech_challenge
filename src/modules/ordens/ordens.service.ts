import { StatusOS } from "@prisma/client";
import { NotFoundError, BusinessError, StockError } from "../../shared/errors";
import { OrdensRepository } from "./ordens.repository";
import type {
  CriarOSInput,
  AtualizarOSInput,
  AdicionarItensInput,
  AvancarStatusInput,
  ListarOSInput,
} from "./ordens.schema";

const CANCELAVEIS: StatusOS[] = [
  StatusOS.RECEBIDA,
  StatusOS.EM_DIAGNOSTICO,
  StatusOS.AGUARDANDO_APROVACAO,
  StatusOS.EM_EXECUCAO,
];

const TRANSICOES: Record<StatusOS, StatusOS[]> = {
  RECEBIDA: [StatusOS.EM_DIAGNOSTICO],
  EM_DIAGNOSTICO: [StatusOS.AGUARDANDO_APROVACAO],
  AGUARDANDO_APROVACAO: [StatusOS.EM_EXECUCAO],
  EM_EXECUCAO: [StatusOS.FINALIZADA],
  FINALIZADA: [StatusOS.ENTREGUE],
  ENTREGUE: [],
  CANCELADA: [],
};

export const STATUS_LABEL: Record<StatusOS, string> = {
  RECEBIDA: "Recebida",
  EM_DIAGNOSTICO: "Em Diagnóstico",
  AGUARDANDO_APROVACAO: "Aguardando Aprovação",
  EM_EXECUCAO: "Em Execução",
  FINALIZADA: "Finalizada",
  ENTREGUE: "Entregue",
  CANCELADA: "Cancelada",
};

const TIMESTAMP_CAMPO: Partial<Record<StatusOS, object>> = {
  EM_EXECUCAO: { aprovadoEm: new Date(), iniciadoEm: new Date() },
  FINALIZADA: { finalizadoEm: new Date() },
  ENTREGUE: { entregueEm: new Date() },
};

export class OrdensService {
  constructor(private readonly repo: OrdensRepository) {}

  async listar(params: ListarOSInput) {
    const { data, total } = await this.repo.listar(params);
    return {
      data,
      meta: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async buscarPorId(id: string) {
    const os = await this.repo.buscarPorId(id);
    if (!os) throw new NotFoundError("Ordem de Serviço");
    return os;
  }

  async buscarPorNumero(numero: number) {
    const os = await this.repo.buscarPorNumero(numero);
    if (!os) throw new NotFoundError("Ordem de Serviço");
    return os;
  }

  async consultarStatusPublico(numero: number, cpfCnpj: string) {
    const os = await this.repo.buscarStatusPublico(numero, cpfCnpj);
    if (!os) throw new NotFoundError("Ordem de Serviço");
    return { ...os, statusLabel: STATUS_LABEL[os.status] };
  }

  async criar(data: CriarOSInput) {
    const cliente = await this.repo.buscarCliente(data.clienteId);
    if (!cliente) throw new NotFoundError("Cliente");

    const veiculo = await this.repo.buscarVeiculo(data.veiculoId, data.clienteId);
    if (!veiculo) throw new NotFoundError("Veículo");

    const servicos = await Promise.all(
      data.servicos.map(async ({ servicoId }) => {
        const s = await this.repo.buscarServico(servicoId);
        if (!s) throw new NotFoundError(`Serviço (id: ${servicoId})`);
        return s;
      }),
    );

    const pecas = await Promise.all(
      data.pecas.map(async ({ pecaId, quantidade }) => {
        const p = await this.repo.buscarPeca(pecaId);
        if (!p) throw new NotFoundError(`Peça (id: ${pecaId})`);
        if (p.quantidade < quantidade)
          throw new StockError(
            `Estoque insuficiente para "${p.nome}". Disponível: ${p.quantidade}`,
          );
        return { peca: p, quantidade };
      }),
    );

    const totalServicos = servicos.reduce((acc, s) => acc + Number(s.preco), 0);
    const totalPecas = pecas.reduce(
      (acc, { peca, quantidade }) => acc + Number(peca.preco) * quantidade,
      0,
    );

    return this.repo.criar({
      clienteId: data.clienteId,
      veiculoId: data.veiculoId,
      descricao: data.descricao,
      observacoes: data.observacoes,
      valorTotal: totalServicos + totalPecas,
      servicos: servicos.map((s) => ({
        servicoId: s.id,
        preco: Number(s.preco),
      })),
      pecas: pecas.map(({ peca, quantidade }) => ({
        pecaId: peca.id,
        quantidade,
        preco: Number(peca.preco),
      })),
    });
  }

  async atualizar(id: string, data: AtualizarOSInput) {
    const os = await this.buscarPorId(id);
    if (["FINALIZADA", "ENTREGUE", "CANCELADA"].includes(os.status)) {
      throw new BusinessError("Não é possível editar uma OS finalizada, entregue ou cancelada");
    }
    return this.repo.atualizar(id, data);
  }

  async adicionarItens(id: string, data: AdicionarItensInput) {
    const os = await this.buscarPorId(id);
    if (!["RECEBIDA", "EM_DIAGNOSTICO", "AGUARDANDO_APROVACAO"].includes(os.status)) {
      throw new BusinessError("Itens só podem ser adicionados nas fases iniciais da OS");
    }

    const servicos = await Promise.all(
      data.servicos.map(async ({ servicoId }) => {
        const s = await this.repo.buscarServico(servicoId);
        if (!s) throw new NotFoundError(`Serviço (id: ${servicoId})`);
        return s;
      }),
    );

    const pecas = await Promise.all(
      data.pecas.map(async ({ pecaId, quantidade }) => {
        const p = await this.repo.buscarPeca(pecaId);
        if (!p) throw new NotFoundError(`Peça (id: ${pecaId})`);
        if (p.quantidade < quantidade)
          throw new StockError(
            `Estoque insuficiente para "${p.nome}". Disponível: ${p.quantidade}`,
          );
        return { peca: p, quantidade };
      }),
    );

    const addServicos = servicos.reduce((acc, s) => acc + Number(s.preco), 0);
    const addPecas = pecas.reduce(
      (acc, { peca, quantidade }) => acc + Number(peca.preco) * quantidade,
      0,
    );
    const novoTotal = Number(os.valorTotal) + addServicos + addPecas;

    await this.repo.adicionarItens({
      ordemId: id,
      servicos: servicos.map((s) => ({
        servicoId: s.id,
        preco: Number(s.preco),
      })),
      pecas: pecas.map(({ peca, quantidade }) => ({
        pecaId: peca.id,
        quantidade,
        preco: Number(peca.preco),
      })),
      novoTotal,
    });

    return this.buscarPorId(id);
  }

  async avancarStatus(id: string, input: AvancarStatusInput) {
    const os = await this.buscarPorId(id);
    const proximos = TRANSICOES[os.status];
    if (!proximos.length)
      throw new BusinessError(`OS "${STATUS_LABEL[os.status]}" não pode avançar`);

    const novoStatus = proximos[0];

    await this.repo.avancarStatus({
      id,
      statusAtual: os.status,
      novoStatus,
      observacao: input.observacao,
      tempoReal: input.tempoReal,
      qtdServicos: os.servicos.length,
      timestampExtra: TIMESTAMP_CAMPO[novoStatus] ?? {},
    });

    return this.buscarPorId(id);
  }

  async reprovarOS(id: string, observacao?: string) {
    const os = await this.buscarPorId(id);
    if (os.status !== StatusOS.AGUARDANDO_APROVACAO) {
      throw new BusinessError('Apenas OS em "Aguardando Aprovação" podem ser reprovadas');
    }
    await this.repo.reprovar({
      id,
      observacao,
      pecas: os.pecas.map((p) => ({
        pecaId: p.pecaId,
        quantidade: p.quantidade,
      })),
    });
    return this.buscarPorId(id);
  }

  async cancelarOS(id: string, motivo?: string) {
    const os = await this.buscarPorId(id);

    if (!CANCELAVEIS.includes(os.status as StatusOS)) {
      throw new BusinessError(
        `OS com status "${STATUS_LABEL[os.status as StatusOS]}" não pode ser cancelada. ` +
          "Apenas OS Recebida, Em Diagnóstico, Aguardando Aprovação ou Em Execução podem ser canceladas.",
      );
    }

    await this.repo.cancelar({
      id,
      statusAnterior: os.status as StatusOS,
      motivo,
      pecas: os.pecas.map((p) => ({
        pecaId: p.pecaId,
        quantidade: p.quantidade,
      })),
    });

    return this.buscarPorId(id);
  }
}
