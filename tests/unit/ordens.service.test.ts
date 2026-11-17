import { describe, it, expect, vi } from 'vitest';
import { BuscarOrdemPorIdUseCase } from '../../src/application/use-cases/ordens/buscar-ordem-por-id.use-case';
import { BuscarOrdemPorNumeroUseCase } from '../../src/application/use-cases/ordens/buscar-ordem-por-numero.use-case';
import { CriarOrdemUseCase } from '../../src/application/use-cases/ordens/criar-ordem.use-case';
import { AtualizarOrdemUseCase } from '../../src/application/use-cases/ordens/atualizar-ordem.use-case';
import { ListarOrdensUseCase } from '../../src/application/use-cases/ordens/listar-ordens.use-case';
import { ConsultarStatusPublicoUseCase } from '../../src/application/use-cases/ordens/consultar-status-publico.use-case';
import { CancelarOrdemUseCase } from '../../src/application/use-cases/ordens/cancelar-ordem.use-case';
import { EntregarOrdemUseCase } from '../../src/application/use-cases/ordens/entregar-ordem.use-case';
import { ConsultarSagaUseCase } from '../../src/application/use-cases/ordens/consultar-saga.use-case';
import { ExecutorDeSaga } from '../../src/application/saga/executor-saga';
import { NotificadorCliente } from '../../src/application/saga/notificador-cliente';
import type {
  IOrdemRepository,
  InicioSaga,
  OrdemRecord,
} from '../../src/domain/repositories/ordens.repository.interface';
import type {
  ISagaRepository,
  SagaRecord,
} from '../../src/domain/repositories/saga.repository.interface';
import type { ICache } from '../../src/domain/services/cache.service.interface';
import type { IEmailService } from '../../src/domain/services/email.service.interface';
import { COMANDOS } from '../../src/domain/mensageria/mensagem';
import { NotFoundError, BusinessError } from '../../src/shared/errors';

const OS_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';
const CLI_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VEI_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const mockOS = (sobrescrever: Partial<OrdemRecord> = {}): OrdemRecord =>
  ({
    id: OS_ID,
    numero: 1,
    clienteId: CLI_ID,
    veiculoId: VEI_ID,
    status: 'RECEBIDA',
    descricao: null,
    observacoes: null,
    valorTotal: 0,
    orcamentoId: null,
    linkPagamento: null,
    aprovadoEm: null,
    pagoEm: null,
    iniciadoEm: null,
    finalizadoEm: null,
    entregueEm: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    cliente: { id: CLI_ID, nome: 'João', cpfCnpj: '11144477735', email: 'j@x.com', telefone: null },
    veiculo: {
      id: VEI_ID,
      placa: 'ABC1234',
      marca: 'Toyota',
      modelo: 'Corolla',
      ano: 2020,
      cor: null,
      clienteId: CLI_ID,
      ativo: true,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    },
    itens: [],
    historico: [],
    saga: null,
    ...sobrescrever,
  }) as OrdemRecord;

const mockSaga = (sobrescrever: Partial<SagaRecord> = {}): SagaRecord => ({
  id: 'saga-1',
  ordemId: OS_ID,
  etapa: 'DIAGNOSTICO',
  status: 'EM_ANDAMENTO',
  participantes: ['execucao'],
  compensacoesPendentes: [],
  motivoFalha: null,
  versao: 3,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
  ...sobrescrever,
});

const makeRepo = () =>
  ({
    buscarPorId: vi.fn(),
    buscarPorNumero: vi.fn(),
    buscarStatusPublico: vi.fn(),
    listar: vi.fn(),
    criarComSaga: vi.fn(),
    atualizar: vi.fn(),
    mudarStatus: vi.fn(),
    buscarCliente: vi.fn(),
    buscarVeiculo: vi.fn(),
  }) as unknown as IOrdemRepository;

const makeSagas = () =>
  ({
    buscarPorOrdem: vi.fn(),
    buscarComPassos: vi.fn(),
    jaProcessada: vi.fn(),
    aplicarTransicao: vi.fn(),
  }) as unknown as ISagaRepository;

const makeCache = () =>
  ({ obter: vi.fn(), definir: vi.fn(), remover: vi.fn() }) as unknown as ICache;

const makeEmail = () =>
  ({
    enviarStatusAtualizado: vi.fn().mockResolvedValue(undefined),
    enviarAprovacaoSolicitada: vi.fn().mockResolvedValue(undefined),
    enviarPagamentoSolicitado: vi.fn().mockResolvedValue(undefined),
  }) as unknown as IEmailService;

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('Buscar OS', () => {
  it('por id retorna a OS', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue(mockOS());
    expect((await new BuscarOrdemPorIdUseCase(repo).execute(OS_ID)).id).toBe(OS_ID);
  });

  it('por id lança NotFoundError', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue(null);
    await expect(new BuscarOrdemPorIdUseCase(repo).execute(OS_ID)).rejects.toThrow(NotFoundError);
  });

  it('por número lança NotFoundError', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorNumero).mockResolvedValue(null);
    await expect(new BuscarOrdemPorNumeroUseCase(repo).execute(9)).rejects.toThrow(NotFoundError);
  });

  it('listagem calcula a paginação', async () => {
    const repo = makeRepo();
    vi.mocked(repo.listar).mockResolvedValue({ data: [], total: 45 });
    const r = await new ListarOrdensUseCase(repo).execute({ page: 2, limit: 20 });
    expect(r.meta).toEqual({ page: 2, limit: 20, total: 45, totalPages: 3 });
  });
});

describe('CriarOrdemUseCase', () => {
  it('cria a OS e grava o comando de diagnóstico no outbox da saga', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarCliente).mockResolvedValue({ id: CLI_ID });
    vi.mocked(repo.buscarVeiculo).mockResolvedValue({ id: VEI_ID });
    let saidas: ReturnType<InicioSaga['montarMensagens']> = [];
    vi.mocked(repo.criarComSaga).mockImplementation(async (_dados, saga) => {
      saidas = saga.montarMensagens(mockOS(), 'saga-9');
      return mockOS();
    });

    const ordem = await new CriarOrdemUseCase(repo, logger).execute({
      clienteId: CLI_ID,
      veiculoId: VEI_ID,
    });

    expect(ordem.id).toBe(OS_ID);
    expect(saidas).toHaveLength(1);
    expect(saidas[0].mensagem).toMatchObject({
      tipo: COMANDOS.ABRIR_DIAGNOSTICO,
      sagaId: 'saga-9',
      ordemId: OS_ID,
    });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'os_criada', sagaId: 'saga-9' }),
      expect.any(String),
    );
  });

  it('lança NotFoundError para cliente inexistente', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarCliente).mockResolvedValue(null);
    await expect(
      new CriarOrdemUseCase(repo).execute({ clienteId: CLI_ID, veiculoId: VEI_ID }),
    ).rejects.toThrow(NotFoundError);
  });

  it('lança NotFoundError para veículo de outro cliente', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarCliente).mockResolvedValue({ id: CLI_ID });
    vi.mocked(repo.buscarVeiculo).mockResolvedValue(null);
    await expect(
      new CriarOrdemUseCase(repo).execute({ clienteId: CLI_ID, veiculoId: VEI_ID }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('AtualizarOrdemUseCase', () => {
  it('bloqueia edição de OS finalizada', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue(mockOS({ status: 'FINALIZADA' }));
    await expect(new AtualizarOrdemUseCase(repo).execute(OS_ID, {})).rejects.toThrow(BusinessError);
  });

  it('atualiza OS em andamento', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue(mockOS());
    vi.mocked(repo.atualizar).mockResolvedValue(mockOS({ descricao: 'x' }));
    expect(
      (await new AtualizarOrdemUseCase(repo).execute(OS_ID, { descricao: 'x' })).descricao,
    ).toBe('x');
  });

  it('lança NotFoundError', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue(null);
    await expect(new AtualizarOrdemUseCase(repo).execute(OS_ID, {})).rejects.toThrow(NotFoundError);
  });
});

describe('CancelarOrdemUseCase', () => {
  const montar = () => {
    const repo = makeRepo();
    const sagas = makeSagas();
    const cache = makeCache();
    const executor = new ExecutorDeSaga(
      sagas,
      new NotificadorCliente(makeEmail(), logger),
      cache,
      { cabecalhosDePropagacao: () => ({}) },
      logger,
    );
    return { repo, sagas, cache, uc: new CancelarOrdemUseCase(repo, sagas, executor, cache) };
  };

  it('inicia a compensação quando a OS tem saga em andamento', async () => {
    const { repo, sagas, uc } = montar();
    vi.mocked(repo.buscarPorId).mockResolvedValue(mockOS());
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(mockSaga());

    const r = await uc.execute(OS_ID, 'Cliente desistiu');

    expect(r.compensacaoIniciada).toBe(true);
    const transicao = vi.mocked(sagas.aplicarTransicao).mock.calls[0][0];
    expect(transicao.estado.status).toBe('COMPENSANDO');
    expect(transicao.versaoEsperada).toBe(3);
    expect(transicao.saidas.map((s) => s.mensagem.tipo)).toEqual([COMANDOS.CANCELAR_EXECUCAO]);
    expect(transicao.saidas[0].mensagem.dados).toMatchObject({ motivo: 'Cliente desistiu' });
    expect(transicao.mudancaDeStatus).toBeNull();
    expect(transicao.mensagemProcessada).toBeNull();
  });

  it('usa motivo padrão quando não informado', async () => {
    const { repo, sagas, uc } = montar();
    vi.mocked(repo.buscarPorId).mockResolvedValue(mockOS());
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(mockSaga());
    await uc.execute(OS_ID);
    expect(vi.mocked(sagas.aplicarTransicao).mock.calls[0][0].estado.motivoFalha).toBe(
      'Cancelada pela oficina',
    );
  });

  it('recusa cancelar com saga já concluída', async () => {
    const { repo, sagas, uc } = montar();
    vi.mocked(repo.buscarPorId).mockResolvedValue(mockOS({ status: 'FINALIZADA' }));
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(
      mockSaga({ etapa: 'CONCLUIDA', status: 'CONCLUIDA' }),
    );
    await expect(uc.execute(OS_ID)).rejects.toThrow(BusinessError);
  });

  it('cancela direto uma OS antiga, criada antes da saga', async () => {
    const { repo, sagas, cache, uc } = montar();
    vi.mocked(repo.buscarPorId)
      .mockResolvedValueOnce(mockOS({ status: 'EM_DIAGNOSTICO' }))
      .mockResolvedValueOnce(mockOS({ status: 'CANCELADA' }));
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(null);

    const r = await uc.execute(OS_ID, 'x');

    expect(r.compensacaoIniciada).toBe(false);
    expect(r.ordem.status).toBe('CANCELADA');
    expect(repo.mudarStatus).toHaveBeenCalledWith(
      expect.objectContaining({ novoStatus: 'CANCELADA', statusAnterior: 'EM_DIAGNOSTICO' }),
    );
    expect(cache.remover).toHaveBeenCalledWith('os:publica:1');
  });

  it('usa observação padrão ao cancelar OS antiga sem motivo', async () => {
    const { repo, sagas, uc } = montar();
    vi.mocked(repo.buscarPorId).mockResolvedValue(mockOS());
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(null);
    await uc.execute(OS_ID);
    expect(repo.mudarStatus).toHaveBeenCalledWith(
      expect.objectContaining({ observacao: 'Ordem de serviço cancelada' }),
    );
  });

  it('recusa cancelar OS antiga já entregue', async () => {
    const { repo, sagas, uc } = montar();
    vi.mocked(repo.buscarPorId).mockResolvedValue(mockOS({ status: 'ENTREGUE' }));
    vi.mocked(sagas.buscarPorOrdem).mockResolvedValue(null);
    await expect(uc.execute(OS_ID)).rejects.toThrow(BusinessError);
  });

  it('lança NotFoundError', async () => {
    const { repo, uc } = montar();
    vi.mocked(repo.buscarPorId).mockResolvedValue(null);
    await expect(uc.execute(OS_ID)).rejects.toThrow(NotFoundError);
  });
});

describe('EntregarOrdemUseCase', () => {
  it('entrega OS finalizada, invalida o cache e notifica', async () => {
    const repo = makeRepo();
    const cache = makeCache();
    const email = makeEmail();
    vi.mocked(repo.buscarPorId)
      .mockResolvedValueOnce(mockOS({ status: 'FINALIZADA' }))
      .mockResolvedValueOnce(mockOS({ status: 'ENTREGUE' }));

    const r = await new EntregarOrdemUseCase(
      repo,
      new NotificadorCliente(email, logger),
      cache,
      logger,
    ).execute(OS_ID);

    expect(r.status).toBe('ENTREGUE');
    expect(repo.mudarStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        novoStatus: 'ENTREGUE',
        observacao: 'Veículo entregue ao cliente',
      }),
    );
    expect(cache.remover).toHaveBeenCalledWith('os:publica:1');
    expect(email.enviarStatusAtualizado).toHaveBeenCalled();
  });

  it('recusa entregar OS que não está finalizada', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue(mockOS({ status: 'EM_EXECUCAO' }));
    await expect(
      new EntregarOrdemUseCase(
        repo,
        new NotificadorCliente(makeEmail(), logger),
        makeCache(),
      ).execute(OS_ID),
    ).rejects.toThrow(BusinessError);
  });

  it('lança NotFoundError', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarPorId).mockResolvedValue(null);
    await expect(
      new EntregarOrdemUseCase(
        repo,
        new NotificadorCliente(makeEmail(), logger),
        makeCache(),
      ).execute(OS_ID),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('ConsultarStatusPublicoUseCase com cache', () => {
  const statusPublico = {
    id: OS_ID,
    numero: 1,
    status: 'EM_DIAGNOSTICO',
    valorTotal: 0,
    linkPagamento: null,
    criadoEm: new Date(),
    aprovadoEm: null,
    pagoEm: null,
    iniciadoEm: null,
    finalizadoEm: null,
    entregueEm: null,
    veiculo: { placa: 'A', marca: 'B', modelo: 'C' },
    itens: [],
    historico: [],
  } as const;

  it('em cache miss consulta o banco e grava por 60 s', async () => {
    const repo = makeRepo();
    const cache = makeCache();
    vi.mocked(cache.obter).mockResolvedValue(null);
    vi.mocked(repo.buscarStatusPublico).mockResolvedValue(statusPublico as never);

    const r = await new ConsultarStatusPublicoUseCase(repo, cache).execute(1, '111.444.777-35');

    expect(r.statusLabel).toBe('Em Diagnóstico');
    expect(cache.definir).toHaveBeenCalledWith(
      'os:publica:1',
      expect.objectContaining({ dados: statusPublico }),
      60,
    );
  });

  it('em cache hit com o mesmo documento não toca o banco', async () => {
    const repo = makeRepo();
    const cache = makeCache();
    const definido = vi.mocked(cache.definir);
    vi.mocked(cache.obter).mockResolvedValue(null);
    vi.mocked(repo.buscarStatusPublico).mockResolvedValue(statusPublico as never);
    await new ConsultarStatusPublicoUseCase(repo, cache).execute(1, '11144477735');
    const entrada = definido.mock.calls[0][1];

    vi.mocked(repo.buscarStatusPublico).mockClear();
    vi.mocked(cache.obter).mockResolvedValue(entrada);
    const r = await new ConsultarStatusPublicoUseCase(repo, cache).execute(1, '111.444.777-35');

    expect(r.id).toBe(OS_ID);
    expect(repo.buscarStatusPublico).not.toHaveBeenCalled();
  });

  it('em cache hit com documento diferente devolve 404 como o banco faria', async () => {
    const repo = makeRepo();
    const cache = makeCache();
    vi.mocked(cache.obter).mockResolvedValue({ documento: 'outro', dados: statusPublico });
    await expect(
      new ConsultarStatusPublicoUseCase(repo, cache).execute(1, '11144477735'),
    ).rejects.toThrow(NotFoundError);
    expect(repo.buscarStatusPublico).not.toHaveBeenCalled();
  });

  it('sem cache configurado consulta o banco e devolve 404 quando não acha', async () => {
    const repo = makeRepo();
    vi.mocked(repo.buscarStatusPublico).mockResolvedValue(null);
    await expect(new ConsultarStatusPublicoUseCase(repo).execute(1, '11144477735')).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe('ConsultarSagaUseCase', () => {
  it('retorna a saga com os passos', async () => {
    const sagas = makeSagas();
    vi.mocked(sagas.buscarComPassos).mockResolvedValue({ ...mockSaga(), passos: [] });
    expect((await new ConsultarSagaUseCase(sagas).execute(OS_ID)).id).toBe('saga-1');
  });

  it('lança NotFoundError para OS sem saga', async () => {
    const sagas = makeSagas();
    vi.mocked(sagas.buscarComPassos).mockResolvedValue(null);
    await expect(new ConsultarSagaUseCase(sagas).execute(OS_ID)).rejects.toThrow(NotFoundError);
  });
});
