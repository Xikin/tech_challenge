import { NotFoundError } from "../../../shared/errors";
import { STATUS_LABEL } from "./ordens.constants";
import type { IOrdemRepository } from "../../../domain/repositories/ordens.repository.interface";
import type { StatusOS } from "@prisma/client";

export class ConsultarStatusPublicoUseCase {
  constructor(private readonly repo: IOrdemRepository) {}

  async execute(numero: number, cpfCnpj: string) {
    const os = await this.repo.buscarStatusPublico(numero, cpfCnpj);
    if (!os) throw new NotFoundError("Ordem de Serviço");
    return { ...os, statusLabel: STATUS_LABEL[os.status as StatusOS] };
  }
}
