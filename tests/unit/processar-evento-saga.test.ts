import { describe, it, expect, vi } from 'vitest';
import { ProcessarEventoSagaUseCase } from '../../src/application/saga/processar-evento-saga.use-case';
import { ExecutorDeSaga } from '../../src/application/saga/executor-saga';
import { NotificadorCliente } from '../../src/application/saga/notificador-cliente';
import {
  COMANDOS,
  EVENTOS,
  EventoPrematuroError,
  MensagemInvalidaError,
  type Mensagem,
} from '../../src/domain/mensageria/mensagem';
import type {
  IOrdemRepository,
  OrdemRecord,
} from '../../src/domain/repositories/ordens.repository.interface';
import type {
  ISagaRepository,
  SagaRecord,
} from '../../src/domain/repositories/saga.repository.interface';
import type { ICache } from '../../src/domain/services/cache.service.interface';
import type { IEmailService } from '../../src/domain/services/email.service.interface';

const OS_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

const ordem = (sobrescrever: Partial<OrdemRecord> = {}) =>
  ({
    id: OS_ID,
    numero: 12,
    status: 'EM_DIAGNOSTICO',
    descricao: null,
    valorTotal: 0,
    orcamentoId: null,
    criadoEm: new Date(Date.now() - 1000),
    historico: [],
    cliente: { id: 'c', nome: 'Ana', cpfCnpj: '1', email: 'ana@x.com', telefone: null },
    veiculo: { placa: 'P', marca: 'M', modelo: 'X', ano: 2020 },
    ...sobrescrever,
  }) as unknown as OrdemRecord;

const saga = (sobrescrever: Partial<SagaRecord> = {}): SagaRecord => ({
  id: 'saga-1',
  ordemId: OS_ID,
  etapa: 'DIAGNOSTICO',
  status: 'EM_ANDAMENTO',
  participantes: ['execucao'],
  compensacoesPendentes: [],
  motivoFalha: null,
  versao: 0,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
  ...sobrescrever,
});

function mensagem(tipo: string, dados: Record<string, unknown> = {}): Mensagem {
  return {
    id: 'msg-1',
    tipo,
    versao: 1,
    sagaId: 'saga-1',
    ordemId: OS_ID,
    causadaPor: null,
    origem: 'teste',
    ocorridaEm: new Date().toISOString(),
    dados,
  };
}

function montar() {
  const ordens = { buscarPorId: vi.fn() } as unknown as IOrdemRepository;
  const sagas = {
    buscarPorOrdem: vi.fn(),
    buscarComPassos: vi.fn(),
    jaProcessada: vi.fn().mockResolvedValue(false),
    aplicarTransicao: vi.fn(),
  } as unknown as ISagaRepository;
  const cache = { obter: vi.fn(), definir: vi.fn(), remover: vi.fn() } as unknown as ICache;
  const email = {
    enviarStatusAtualizado: vi.fn().mockResolvedValue(undefined),
    enviarAprovacaoSolicitada: vi.fn().mockResolvedValue(undefined),
    enviarPagamentoSolicitado: vi.fn().mockResolvedValue(undefined),
  } as unknown as IEmailService;
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const executor = new ExecutorDeSaga(
    sagas,
    new NotificadorCliente(email, logger),
    cache,
    { cabecalhosDePropagacao: () => ({ traceparent: '00-abc' }) },
    logger,
  );
  return {
    ordens,
    sagas,
    cache,
    email,
    logger,
    uc: new ProcessarEventoSagaUseCase(ordens, sagas, executor, logger),
  };
}

describe('ProcessarEventoSagaUseCase', () => {
  it('diagnóstico concluído grava itens, valor, passos e o comando de orçamento numa transição', async () => {
    const { ordens, sagas, cache, uc } = montar();
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(saga({ versao: 4 }));
    vi.mocked(ordens.buscarPorId).mockResolvedValue(ordem());
    const itens = [
      { tipo: 'SERVICO', referenciaId: 's', nome: 'Freio', quantidade: 1, precoUnitario: 200 },
    ];

    await uc.execute(mensagem(EVENTOS.DIAGNOSTICO_CONCLUIDO, { itens }));

    const t = vi.mocked(sagas.aplicarTransicao).mock.calls[0][0];
    expect(t.versaoEsperada).toBe(4);
    expect(t.estado.etapa).toBe('ORCAMENTO');
    expect(t.efeitos).toEqual({ itens, valorTotal: 200 });
    expect(t.mudancaDeStatus).toBeNull();
    expect(t.saidas).toHaveLength(1);
    expect(t.saidas[0].mensagem).toMatchObject({
      tipo: COMANDOS.GERAR_ORCAMENTO,
      causadaPor: 'msg-1',
      dados: { numeroOS: 12, itens },
    });
    expect(t.saidas[0].cabecalhos).toEqual({ traceparent: '00-abc' });
    expect(t.passos.map((p) => [p.direcao, p.tipo])).toEqual([
      ['RECEBIDA', EVENTOS.DIAGNOSTICO_CONCLUIDO],
      ['ENVIADA', COMANDOS.GERAR_ORCAMENTO],
    ]);
    expect(t.mensagemProcessada).toEqual({ id: 'msg-1', consumidor: 'os.saga' });
    expect(cache.remover).not.toHaveBeenCalled();
  });

  it('orçamento gerado muda o status, invalida o cache e pede aprovação por e-mail', async () => {
    const { ordens, sagas, cache, email, logger, uc } = montar();
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(
      saga({ etapa: 'ORCAMENTO', participantes: ['execucao', 'billing'] }),
    );
    vi.mocked(ordens.buscarPorId).mockResolvedValue(ordem());

    await uc.execute(mensagem(EVENTOS.ORCAMENTO_GERADO, { orcamentoId: 'o-1', valorTotal: 300 }));

    const t = vi.mocked(sagas.aplicarTransicao).mock.calls[0][0];
    expect(t.mudancaDeStatus).toEqual({
      anterior: 'EM_DIAGNOSTICO',
      novo: 'AGUARDANDO_APROVACAO',
      observacao: 'Orçamento enviado para aprovação do cliente',
    });
    expect(cache.remover).toHaveBeenCalledWith('os:publica:12');
    expect(email.enviarAprovacaoSolicitada).toHaveBeenCalledWith(
      expect.objectContaining({ valorTotal: 300, numeroOS: 12 }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'os_status_alterado', statusNovo: 'AGUARDANDO_APROVACAO' }),
      expect.any(String),
    );
  });

  it('orçamento aprovado envia o link de pagamento', async () => {
    const { ordens, sagas, email, uc } = montar();
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(
      saga({ etapa: 'APROVACAO', participantes: ['execucao', 'billing'] }),
    );
    vi.mocked(ordens.buscarPorId).mockResolvedValue(
      ordem({ status: 'AGUARDANDO_APROVACAO', valorTotal: 300 }),
    );

    await uc.execute(
      mensagem(EVENTOS.ORCAMENTO_APROVADO, {
        orcamentoId: 'o-1',
        linkPagamento: 'https://mp.test/p',
      }),
    );

    expect(email.enviarPagamentoSolicitado).toHaveBeenCalledWith(
      expect.objectContaining({ linkPagamento: 'https://mp.test/p', valorTotal: 300 }),
    );
  });

  it('compensação registra o motivo no log e manda o orcamentoId para o billing', async () => {
    const { ordens, sagas, logger, uc } = montar();
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(
      saga({ etapa: 'PAGAMENTO', participantes: ['execucao', 'billing'] }),
    );
    vi.mocked(ordens.buscarPorId).mockResolvedValue(
      ordem({ status: 'AGUARDANDO_PAGAMENTO', orcamentoId: 'o-1' }),
    );

    await uc.execute(mensagem(EVENTOS.PAGAMENTO_RECUSADO, { motivo: 'saldo' }));

    const t = vi.mocked(sagas.aplicarTransicao).mock.calls[0][0];
    expect(t.saidas.map((s) => s.mensagem.tipo)).toEqual([
      COMANDOS.CANCELAR_EXECUCAO,
      COMANDOS.CANCELAR_BILLING,
    ]);
    expect(t.saidas[1].mensagem.dados).toMatchObject({
      orcamentoId: 'o-1',
      motivo: 'Pagamento recusado: saldo',
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'saga_compensacao_iniciada' }),
      expect.any(String),
    );
  });

  it('última confirmação de compensação cancela a OS e avisa o cliente', async () => {
    const { ordens, sagas, email, uc } = montar();
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(
      saga({
        status: 'COMPENSANDO',
        participantes: ['execucao', 'billing'],
        compensacoesPendentes: ['billing'],
        motivoFalha: 'Pagamento recusado',
      }),
    );
    vi.mocked(ordens.buscarPorId).mockResolvedValue(ordem({ status: 'AGUARDANDO_PAGAMENTO' }));

    await uc.execute(mensagem(EVENTOS.BILLING_CANCELADO, { estornado: false }));

    const t = vi.mocked(sagas.aplicarTransicao).mock.calls[0][0];
    expect(t.estado.status).toBe('COMPENSADA');
    expect(t.mudancaDeStatus?.novo).toBe('CANCELADA');
    expect(email.enviarStatusAtualizado).toHaveBeenCalledWith(
      expect.objectContaining({ statusNovo: 'Cancelada' }),
    );
  });

  it('evento de etapa já vencida é registrado como ignorado, sem comandos', async () => {
    const { ordens, sagas, logger, uc } = montar();
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(saga({ etapa: 'APROVACAO' }));
    vi.mocked(ordens.buscarPorId).mockResolvedValue(ordem());

    await uc.execute(mensagem(EVENTOS.DIAGNOSTICO_INICIADO));

    const t = vi.mocked(sagas.aplicarTransicao).mock.calls[0][0];
    expect(t.saidas).toEqual([]);
    expect(t.mensagemProcessada).toEqual({ id: 'msg-1', consumidor: 'os.saga' });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'saga_evento_ignorado' }),
      expect.any(String),
    );
  });

  it('evento que chegou antes da hora é adiado para nova tentativa, sem gravar nada', async () => {
    const { ordens, sagas, logger, uc } = montar();
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(saga({ etapa: 'ORCAMENTO' }));
    vi.mocked(ordens.buscarPorId).mockResolvedValue(ordem());

    await expect(
      uc.execute(
        mensagem(EVENTOS.ORCAMENTO_APROVADO, { orcamentoId: 'o', linkPagamento: 'https://mp/p' }),
      ),
    ).rejects.toThrow(EventoPrematuroError);
    expect(sagas.aplicarTransicao).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'saga_evento_adiado' }),
      expect.any(String),
    );
  });

  it('descarta mensagem já processada sem tocar na saga', async () => {
    const { sagas, uc } = montar();
    vi.mocked(sagas.jaProcessada).mockResolvedValue(true);
    await uc.execute(mensagem(EVENTOS.EXECUCAO_INICIADA));
    expect(sagas.buscarPorOrdem).not.toHaveBeenCalled();
    expect(sagas.aplicarTransicao).not.toHaveBeenCalled();
  });

  it('rejeita como definitiva mensagem de OS sem saga', async () => {
    const { sagas, uc } = montar();
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(null);
    await expect(uc.execute(mensagem(EVENTOS.EXECUCAO_INICIADA))).rejects.toThrow(
      MensagemInvalidaError,
    );
  });

  it('rejeita mensagem com sagaId de outra saga', async () => {
    const { sagas, uc } = montar();
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(saga({ id: 'outra' }));
    await expect(uc.execute(mensagem(EVENTOS.EXECUCAO_INICIADA))).rejects.toThrow(/não pertence/);
  });

  it('rejeita mensagem quando a OS sumiu', async () => {
    const { ordens, sagas, uc } = montar();
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(saga());
    vi.mocked(ordens.buscarPorId).mockResolvedValue(null);
    await expect(uc.execute(mensagem(EVENTOS.EXECUCAO_INICIADA))).rejects.toThrow(
      MensagemInvalidaError,
    );
  });

  it('falha no e-mail não interrompe a saga e vira log de integração', async () => {
    const { ordens, sagas, email, logger, uc } = montar();
    vi.mocked(email.enviarStatusAtualizado).mockRejectedValue(new Error('SMTP fora'));
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(saga());
    vi.mocked(ordens.buscarPorId).mockResolvedValue(ordem({ status: 'RECEBIDA' }));

    await uc.execute(mensagem(EVENTOS.DIAGNOSTICO_INICIADO));
    await new Promise((r) => setImmediate(r));

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'falha_integracao', integracao: 'email' }),
      expect.any(String),
    );
  });

  it('cliente sem e-mail não recebe notificação', async () => {
    const { ordens, sagas, email, uc } = montar();
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(saga());
    vi.mocked(ordens.buscarPorId).mockResolvedValue(
      ordem({
        status: 'RECEBIDA',
        cliente: { id: 'c', nome: 'A', cpfCnpj: '1', email: null, telefone: null },
      }),
    );
    await uc.execute(mensagem(EVENTOS.DIAGNOSTICO_INICIADO));
    expect(email.enviarStatusAtualizado).not.toHaveBeenCalled();
  });
});
