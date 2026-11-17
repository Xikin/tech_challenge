export interface IRastreamento {
  cabecalhosDePropagacao(): Record<string, string>;
}

export const rastreamentoDesligado: IRastreamento = {
  cabecalhosDePropagacao: () => ({}),
};
