import type { StatusOS } from "@prisma/client";

export const STATUS_LABEL: Record<StatusOS, string> = {
  RECEBIDA: "Recebida",
  EM_DIAGNOSTICO: "Em Diagnóstico",
  AGUARDANDO_APROVACAO: "Aguardando Aprovação",
  EM_EXECUCAO: "Em Execução",
  FINALIZADA: "Finalizada",
  ENTREGUE: "Entregue",
  CANCELADA: "Cancelada",
};

export const TRANSICOES: Record<StatusOS, StatusOS[]> = {
  RECEBIDA: ["EM_DIAGNOSTICO"],
  EM_DIAGNOSTICO: ["AGUARDANDO_APROVACAO"],
  AGUARDANDO_APROVACAO: ["EM_EXECUCAO"],
  EM_EXECUCAO: ["FINALIZADA"],
  FINALIZADA: ["ENTREGUE"],
  ENTREGUE: [],
  CANCELADA: [],
};

export const CANCELAVEIS: StatusOS[] = [
  "RECEBIDA",
  "EM_DIAGNOSTICO",
  "AGUARDANDO_APROVACAO",
  "EM_EXECUCAO",
];

export const TIMESTAMP_CAMPO: Partial<Record<StatusOS, object>> = {
  EM_EXECUCAO: { aprovadoEm: new Date(), iniciadoEm: new Date() },
  FINALIZADA: { finalizadoEm: new Date() },
  ENTREGUE: { entregueEm: new Date() },
};
