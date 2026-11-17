export interface ICache {
  obter<T>(chave: string): Promise<T | null>;
  definir(chave: string, valor: unknown, ttlSegundos: number): Promise<void>;
  remover(chave: string): Promise<void>;
}

export const cacheDesligado: ICache = {
  obter: async () => null,
  definir: async () => {},
  remover: async () => {},
};

export const chaveConsultaPublica = (numeroOS: number) => `os:publica:${numeroOS}`;
