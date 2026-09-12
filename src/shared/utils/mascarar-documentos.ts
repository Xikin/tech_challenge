/**
 * Mascara CPF e CNPJ em texto livre — caminho de URL, querystring, mensagem.
 *
 * Usado no serializer de requisição do logger: sem ele, o Fastify grava a URL
 * crua, e com ela o documento que aparece em `/clientes/cpf-cnpj/:documento` ou
 * em `/ordens/consulta-publica?cpfCnpj=`. CPF é dado pessoal (LGPD) e não pode
 * ir para log nem para o New Relic.
 *
 * Aceita os documentos com ou sem pontuação, e a barra do CNPJ codificada na
 * URL (%2F). CNPJ é tratado primeiro porque contém uma sequência de 11 dígitos.
 * Números de OS, placas e UUIDs não são afetados: a exigência de fronteira de
 * palavra impede casar trechos de sequências maiores.
 */
const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}(?:\/|%2F)?\d{4}-?\d{2}\b/gi;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

export function mascararDocumentos(texto: string): string {
  return texto.replace(CNPJ, '[CNPJ]').replace(CPF, '[CPF]');
}
