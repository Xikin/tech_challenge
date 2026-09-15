import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { LoginUseCase } from '../../src/application/use-cases/auth/login.use-case';
import { UnauthorizedError } from '../../src/shared/errors';

const SENHA_CORRETA = 'Correta@123';

function montar(usuario: unknown) {
  const repo = { buscarPorEmail: vi.fn().mockResolvedValue(usuario) };
  const tokens = { sign: vi.fn().mockReturnValue('token-assinado') };
  return { uc: new LoginUseCase(repo as never, tokens as never), tokens };
}

async function mensagemDeFalha(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (erro) {
    expect(erro).toBeInstanceOf(UnauthorizedError);
    return (erro as Error).message;
  }
  throw new Error('era esperado que o login falhasse');
}

describe('LoginUseCase — sem enumeração de usuários por tempo de resposta', () => {
  let hashReal: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    hashReal = await bcrypt.hash(SENHA_CORRETA, 1);
  });

  it('executa o bcrypt mesmo quando o e-mail não existe', async () => {
    const compare = vi.spyOn(bcrypt, 'compare');
    const { uc } = montar(null);

    await mensagemDeFalha(uc.execute({ email: 'ninguem@x.com', senha: 'Qualquer@1' }));

    expect(compare).toHaveBeenCalledTimes(1);
  });

  it('executa o bcrypt para usuário inativo e recusa mesmo com a senha certa', async () => {
    const compare = vi.spyOn(bcrypt, 'compare');
    const { uc, tokens } = montar({ id: 'u1', email: 'a@x.com', senha: hashReal, ativo: false });

    await mensagemDeFalha(uc.execute({ email: 'a@x.com', senha: SENHA_CORRETA }));

    expect(compare).toHaveBeenCalledTimes(1);
    expect(tokens.sign).not.toHaveBeenCalled();
  });

  it('devolve exatamente a mesma mensagem nas três falhas', async () => {
    const inexistente = await mensagemDeFalha(
      montar(null).uc.execute({ email: 'x@x.com', senha: 'Qualquer@1' }),
    );
    const inativo = await mensagemDeFalha(
      montar({ id: 'u1', email: 'a@x.com', senha: hashReal, ativo: false }).uc.execute({
        email: 'a@x.com',
        senha: SENHA_CORRETA,
      }),
    );
    const senhaErrada = await mensagemDeFalha(
      montar({ id: 'u1', email: 'a@x.com', senha: hashReal, ativo: true }).uc.execute({
        email: 'a@x.com',
        senha: 'Errada@123',
      }),
    );

    expect(new Set([inexistente, inativo, senhaErrada]).size).toBe(1);
  });

  it('autentica usuário ativo com a senha correta', async () => {
    const { uc, tokens } = montar({
      id: 'u1',
      nome: 'Ana',
      email: 'a@x.com',
      senha: hashReal,
      ativo: true,
      role: 'ADMIN',
    });

    const resultado = await uc.execute({ email: 'a@x.com', senha: SENHA_CORRETA });

    expect(resultado.token).toBe('token-assinado');
    expect(tokens.sign).toHaveBeenCalledWith(
      { sub: 'u1', email: 'a@x.com', role: 'ADMIN' },
      expect.any(String),
    );
  });
});
