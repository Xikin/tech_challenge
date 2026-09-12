import { describe, it, expect } from 'vitest';
import { mascararDocumentos } from '../../src/shared/utils/mascarar-documentos';

describe('mascararDocumentos', () => {
  it('mascara CPF no caminho da URL', () => {
    expect(mascararDocumentos('/clientes/cpf-cnpj/52998224725')).toBe('/clientes/cpf-cnpj/[CPF]');
  });

  it('mascara CPF formatado na querystring', () => {
    expect(mascararDocumentos('/ordens/consulta-publica?numero=12&cpfCnpj=529.982.247-25')).toBe(
      '/ordens/consulta-publica?numero=12&cpfCnpj=[CPF]',
    );
  });

  it('mascara CNPJ com e sem pontuação, inclusive com a barra codificada', () => {
    expect(mascararDocumentos('/clientes/cpf-cnpj/11222333000181')).toBe(
      '/clientes/cpf-cnpj/[CNPJ]',
    );
    expect(mascararDocumentos('cpfCnpj=11.222.333/0001-81')).toBe('cpfCnpj=[CNPJ]');
    expect(mascararDocumentos('cpfCnpj=11.222.333%2F0001-81')).toBe('cpfCnpj=[CNPJ]');
  });

  it('preserva UUIDs, números de OS e placas', () => {
    const intactos = [
      '/ordens/d4e5f6a7-b8c9-0123-defa-234567890123',
      '/ordens/numero/1042',
      '/veiculos/placa/ABC1D23',
      '/health/ready',
    ];
    for (const url of intactos) expect(mascararDocumentos(url)).toBe(url);
  });

  it('mascara mais de um documento no mesmo texto', () => {
    expect(mascararDocumentos('a=52998224725&b=11144477735')).toBe('a=[CPF]&b=[CPF]');
  });
});
