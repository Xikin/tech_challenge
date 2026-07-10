import { describe, it, expect } from 'vitest';
import {
  validarCPF,
  validarCNPJ,
  validarPlaca,
  limparDocumento,
  detectarTipoPessoa,
} from '../../src/shared/utils/validators';

describe('Validators', () => {
  describe('validarCPF', () => {
    it('aceita CPF válido', () => expect(validarCPF('11144477735')).toBe(true));
    it('aceita com máscara', () => expect(validarCPF('111.444.777-35')).toBe(true));
    it('rejeita dígitos iguais', () => expect(validarCPF('11111111111')).toBe(false));
    it('rejeita tamanho errado', () => expect(validarCPF('123456789')).toBe(false));
    it('rejeita CPF inválido', () => expect(validarCPF('12345678900')).toBe(false));
  });

  describe('validarCNPJ', () => {
    it('aceita CNPJ válido', () => expect(validarCNPJ('11222333000181')).toBe(true));
    it('aceita com máscara', () => expect(validarCNPJ('11.222.333/0001-81')).toBe(true));
    it('rejeita dígitos iguais', () => expect(validarCNPJ('00000000000000')).toBe(false));
    it('rejeita CNPJ inválido', () => expect(validarCNPJ('11222333000199')).toBe(false));
  });

  describe('validarPlaca', () => {
    it('aceita padrão antigo', () => expect(validarPlaca('ABC1234')).toBe(true));
    it('aceita Mercosul', () => expect(validarPlaca('ABC1D23')).toBe(true));
    it('aceita com traço', () => expect(validarPlaca('ABC-1234')).toBe(true));
    it('rejeita inválida', () => expect(validarPlaca('AB1234')).toBe(false));
  });

  describe('helpers', () => {
    it('limparDocumento remove não-numéricos', () =>
      expect(limparDocumento('111.444.777-35')).toBe('11144477735'));
    it('detecta FISICA por CPF', () => expect(detectarTipoPessoa('11144477735')).toBe('FISICA'));
    it('detecta JURIDICA por CNPJ', () =>
      expect(detectarTipoPessoa('11222333000181')).toBe('JURIDICA'));
  });
});
