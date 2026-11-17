import { randomUUID } from 'node:crypto';
import { setWorldConstructor, World } from '@cucumber/cucumber';
import { CriarOrdemUseCase } from '../../../src/application/use-cases/ordens/criar-ordem.use-case';
import { CancelarOrdemUseCase } from '../../../src/application/use-cases/ordens/cancelar-ordem.use-case';
import { EntregarOrdemUseCase } from '../../../src/application/use-cases/ordens/entregar-ordem.use-case';
import { ProcessarEventoSagaUseCase } from '../../../src/application/saga/processar-evento-saga.use-case';
import { ExecutorDeSaga } from '../../../src/application/saga/executor-saga';
import { NotificadorCliente } from '../../../src/application/saga/notificador-cliente';
import { marcosDoStatus } from '../../../src/domain/ordens/marcos-de-status';
import type { Mensagem, MensagemSaida } from '../../../src/domain/mensageria/mensagem';
import type {
  CriarOrdemData,
  InicioSaga,
  IOrdemRepository,
  MudancaDeStatusData,
  OrdemRecord,
} from '../../../src/domain/repositories/ordens.repository.interface';
import {
  ConflitoDeVersaoError,
  type ISagaRepository,
  type SagaRecord,
  type TransicaoSaga,
} from '../../../src/domain/repositories/saga.repository.interface';
import type { IEmailService } from '../../../src/domain/services/email.service.interface';

const silencioso = { info: () => {}, warn: () => {}, error: () => {} };

class BancoEmMemoria implements IOrdemRepository, ISagaRepository {
  ordens = new Map<string, OrdemRecord>();
  sagas = new Map<string, SagaRecord>();
  processadas = new Set<string>();
  outbox: MensagemSaida[] = [];
  clientes = new Map<string, { id: string; nome: string; email: string }>();
  veiculos = new Map<string, { id: string; placa: string; clienteId: string }>();
  private numero = 0;

  async buscarPorId(id: string) {
    const ordem = this.ordens.get(id);
    if (!ordem) return null;
    const saga = [...this.sagas.values()].find((s) => s.ordemId === id) ?? null;
    return structuredClone({ ...ordem, saga });
  }
  async buscarPorNumero(numero: number) {
    const ordem = [...this.ordens.values()].find((o) => o.numero === numero);
    return ordem ? this.buscarPorId(ordem.id) : null;
  }
  async buscarStatusPublico() {
    return null;
  }
  async listar() {
    return { data: [], total: 0 };
  }
  async atualizar(id: string) {
    return (await this.buscarPorId(id))!;
  }
  async buscarCliente(id: string) {
    return this.clientes.get(id) ?? null;
  }
  async buscarVeiculo(veiculoId: string, clienteId: string) {
    const v = this.veiculos.get(veiculoId);
    return v && v.clienteId === clienteId ? v : null;
  }

  async criarComSaga(dados: CriarOrdemData, inicio: InicioSaga) {
    const cliente = this.clientes.get(dados.clienteId)!;
    const veiculo = this.veiculos.get(dados.veiculoId)!;
    const agora = new Date();
    const ordem = {
      id: randomUUID(),
      numero: ++this.numero,
      clienteId: cliente.id,
      veiculoId: veiculo.id,
      status: 'RECEBIDA',
      descricao: dados.descricao ?? null,
      observacoes: null,
      valorTotal: 0,
      orcamentoId: null,
      linkPagamento: null,
      aprovadoEm: null,
      pagoEm: null,
      iniciadoEm: null,
      finalizadoEm: null,
      entregueEm: null,
      criadoEm: agora,
      atualizadoEm: agora,
      cliente: { ...cliente, cpfCnpj: '52998224725', telefone: null },
      veiculo: {
        id: veiculo.id,
        placa: veiculo.placa,
        marca: 'Volkswagen',
        modelo: 'Gol',
        ano: 2019,
        cor: null,
        clienteId: cliente.id,
        ativo: true,
        criadoEm: agora,
        atualizadoEm: agora,
      },
      itens: [],
      historico: [
        {
          id: randomUUID(),
          ordemId: '',
          statusAnterior: null,
          statusNovo: 'RECEBIDA',
          observacao: inicio.observacao,
          criadoEm: agora,
        },
      ],
      saga: null,
    } as OrdemRecord;
    this.ordens.set(ordem.id, ordem);

    const saga: SagaRecord = {
      id: randomUUID(),
      ordemId: ordem.id,
      ...inicio.estado,
      versao: 0,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    this.sagas.set(saga.id, saga);
    this.outbox.push(...inicio.montarMensagens(ordem, saga.id));
    return (await this.buscarPorId(ordem.id))!;
  }

  async mudarStatus(dados: MudancaDeStatusData) {
    const ordem = this.ordens.get(dados.id)!;
    Object.assign(ordem, { status: dados.novoStatus, ...marcosDoStatus(dados.novoStatus) });
    ordem.historico.push({
      id: randomUUID(),
      ordemId: ordem.id,
      statusAnterior: dados.statusAnterior,
      statusNovo: dados.novoStatus,
      observacao: dados.observacao ?? null,
      criadoEm: new Date(),
    });
  }

  async buscarPorOrdem(ordemId: string) {
    const saga = [...this.sagas.values()].find((s) => s.ordemId === ordemId);
    return saga ? structuredClone(saga) : null;
  }
  async buscarComPassos(ordemId: string) {
    const saga = await this.buscarPorOrdem(ordemId);
    return saga ? { ...saga, passos: [] } : null;
  }
  async jaProcessada(mensagemId: string) {
    return this.processadas.has(mensagemId);
  }

  async aplicarTransicao(t: TransicaoSaga) {
    const saga = this.sagas.get(t.sagaId)!;
    if (saga.versao !== t.versaoEsperada) throw new ConflitoDeVersaoError(t.sagaId);
    Object.assign(saga, t.estado, { versao: saga.versao + 1 });

    const ordem = this.ordens.get(t.ordemId)!;
    if (t.efeitos.valorTotal !== undefined) ordem.valorTotal = t.efeitos.valorTotal;
    if (t.efeitos.orcamentoId) ordem.orcamentoId = t.efeitos.orcamentoId;
    if (t.efeitos.linkPagamento) ordem.linkPagamento = t.efeitos.linkPagamento;
    if (t.efeitos.itens)
      ordem.itens = t.efeitos.itens.map((i) => ({ ...i, id: randomUUID(), ordemId: ordem.id }));
    if (t.mudancaDeStatus)
      await this.mudarStatus({
        id: ordem.id,
        statusAnterior: t.mudancaDeStatus.anterior,
        novoStatus: t.mudancaDeStatus.novo,
        observacao: t.mudancaDeStatus.observacao,
      });

    this.outbox.push(...t.saidas);
    if (t.mensagemProcessada) this.processadas.add(t.mensagemProcessada.id);
  }
}

export class MundoDaOficina extends World {
  banco = new BancoEmMemoria();
  emails: { tipo: string; dados: unknown }[] = [];
  ordemId = '';
  clienteId = '';
  veiculoId = '';
  erro: Error | null = null;
  ultimoEvento: Mensagem | null = null;

  private readonly email: IEmailService = {
    enviarStatusAtualizado: async (dados) => void this.emails.push({ tipo: 'status', dados }),
    enviarAprovacaoSolicitada: async (dados) => void this.emails.push({ tipo: 'aprovacao', dados }),
    enviarPagamentoSolicitado: async (dados) => void this.emails.push({ tipo: 'pagamento', dados }),
  };

  private readonly cache = {
    obter: async () => null,
    definir: async () => {},
    remover: async () => {},
  };
  private readonly rastreamento = { cabecalhosDePropagacao: () => ({}) };
  private readonly notificador = new NotificadorCliente(this.email, silencioso);
  private readonly executor = new ExecutorDeSaga(
    this.banco,
    this.notificador,
    this.cache,
    this.rastreamento,
    silencioso,
  );

  criarOrdem = new CriarOrdemUseCase(this.banco, silencioso, this.rastreamento);
  cancelarOrdem = new CancelarOrdemUseCase(this.banco, this.banco, this.executor, this.cache);
  entregarOrdem = new EntregarOrdemUseCase(this.banco, this.notificador, this.cache, silencioso);
  processarEvento = new ProcessarEventoSagaUseCase(
    this.banco,
    this.banco,
    this.executor,
    silencioso,
  );

  async ordem() {
    return (await this.banco.buscarPorId(this.ordemId))!;
  }

  async saga() {
    return (await this.banco.buscarPorOrdem(this.ordemId))!;
  }

  comandos(tipo: string) {
    return this.banco.outbox.filter((s) => s.mensagem.tipo === tipo).map((s) => s.mensagem);
  }

  async responder(tipo: string, dados: Record<string, unknown> = {}, id = randomUUID()) {
    const saga = await this.saga();
    const evento: Mensagem = {
      id,
      tipo,
      versao: 1,
      sagaId: saga.id,
      ordemId: this.ordemId,
      causadaPor: null,
      origem: tipo.startsWith('billing') ? 'oficina-billing' : 'oficina-execucao',
      ocorridaEm: new Date().toISOString(),
      dados,
    };
    this.ultimoEvento = evento;
    this.erro = null;
    try {
      await this.processarEvento.execute(evento);
    } catch (erro) {
      this.erro = erro as Error;
    }
  }
}

setWorldConstructor(MundoDaOficina);
