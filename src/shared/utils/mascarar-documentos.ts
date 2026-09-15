const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}(?:\/|%2F)?\d{4}-?\d{2}\b/gi;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

export function mascararDocumentos(texto: string): string {
  return texto.replace(CNPJ, '[CNPJ]').replace(CPF, '[CPF]');
}
