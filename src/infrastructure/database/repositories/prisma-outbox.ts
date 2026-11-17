import type { Prisma } from '@prisma/client';
import type { MensagemSaida } from '../../../domain/mensageria/mensagem';

export async function enfileirarNoOutbox(
  tx: Prisma.TransactionClient,
  saidas: MensagemSaida[],
): Promise<void> {
  if (!saidas.length) return;
  await tx.outbox.createMany({
    data: saidas.map((s) => ({
      id: s.mensagem.id,
      routingKey: s.mensagem.tipo,
      payload: s.mensagem as unknown as Prisma.InputJsonValue,
      cabecalhos: s.cabecalhos,
    })),
  });
}
