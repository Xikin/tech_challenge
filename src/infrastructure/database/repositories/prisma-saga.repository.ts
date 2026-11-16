import type { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { enfileirarNoOutbox } from './prisma-outbox';
import { marcosDoStatus } from '../../../domain/ordens/marcos-de-status';
import type { Participante } from '../../../domain/saga/saga-os';
import {
  ConflitoDeVersaoError,
  type ISagaRepository,
  type SagaRecord,
  type TransicaoSaga,
} from '../../../domain/repositories/saga.repository.interface';

type SagaDoBanco = Omit<SagaRecord, 'participantes' | 'compensacoesPendentes'> & {
  participantes: string[];
  compensacoesPendentes: string[];
};

function mapSaga<T extends SagaDoBanco>(saga: T) {
  return {
    ...saga,
    participantes: saga.participantes as Participante[],
    compensacoesPendentes: saga.compensacoesPendentes as Participante[],
  };
}

export class PrismaSagaRepository implements ISagaRepository {
  async buscarPorOrdem(ordemId: string) {
    const saga = await prisma.sagaOS.findUnique({ where: { ordemId } });
    return saga ? mapSaga(saga) : null;
  }

  async buscarComPassos(ordemId: string) {
    const saga = await prisma.sagaOS.findUnique({
      where: { ordemId },
      include: { passos: { orderBy: { criadoEm: 'asc' } } },
    });
    return saga ? mapSaga(saga) : null;
  }

  async jaProcessada(mensagemId: string, consumidor: string) {
    const registro = await prisma.mensagemProcessada.findUnique({ where: { id: mensagemId } });
    return registro?.consumidor === consumidor;
  }

  async aplicarTransicao(t: TransicaoSaga): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.sagaOS.updateMany({
        where: { id: t.sagaId, versao: t.versaoEsperada },
        data: {
          etapa: t.estado.etapa,
          status: t.estado.status,
          participantes: t.estado.participantes,
          compensacoesPendentes: t.estado.compensacoesPendentes,
          motivoFalha: t.estado.motivoFalha,
          versao: { increment: 1 },
        },
      });
      if (count === 0) throw new ConflitoDeVersaoError(t.sagaId);

      const dadosDaOrdem: Prisma.OrdemServicoUpdateInput = {};
      if (t.efeitos.orcamentoId) dadosDaOrdem.orcamentoId = t.efeitos.orcamentoId;
      if (t.efeitos.valorTotal !== undefined) dadosDaOrdem.valorTotal = t.efeitos.valorTotal;
      if (t.efeitos.linkPagamento) dadosDaOrdem.linkPagamento = t.efeitos.linkPagamento;

      if (t.mudancaDeStatus) {
        Object.assign(dadosDaOrdem, {
          status: t.mudancaDeStatus.novo,
          ...marcosDoStatus(t.mudancaDeStatus.novo),
        });
        await tx.historicoOS.create({
          data: {
            ordemId: t.ordemId,
            statusAnterior: t.mudancaDeStatus.anterior,
            statusNovo: t.mudancaDeStatus.novo,
            observacao: t.mudancaDeStatus.observacao,
          },
        });
      }

      if (t.efeitos.itens) {
        await tx.itemOS.deleteMany({ where: { ordemId: t.ordemId } });
        await tx.itemOS.createMany({
          data: t.efeitos.itens.map((i) => ({
            ordemId: t.ordemId,
            tipo: i.tipo,
            referenciaId: i.referenciaId,
            nome: i.nome,
            quantidade: i.quantidade,
            precoUnitario: i.precoUnitario,
          })),
        });
      }

      if (Object.keys(dadosDaOrdem).length)
        await tx.ordemServico.update({ where: { id: t.ordemId }, data: dadosDaOrdem });

      await tx.passoSaga.createMany({
        data: t.passos.map((p) => ({ sagaId: t.sagaId, ...p })),
      });
      await enfileirarNoOutbox(tx, t.saidas);
      if (t.mensagemProcessada) await tx.mensagemProcessada.create({ data: t.mensagemProcessada });
    });
  }
}
