import bcrypt from 'bcryptjs';
import { UnauthorizedError } from '../../../shared/errors';
import type { IAuthRepository } from '../../../domain/repositories/auth.repository.interface';
import type { ITokenService } from '../../../domain/services/token.service.interface';
import { env } from '../../../config/env';

export interface LoginInput {
  email: string;
  senha: string;
}

const MENSAGEM_FALHA = 'Email ou senha inválidos';

/**
 * Hash de uma senha que não pertence a ninguém, com o mesmo custo dos hashes reais.
 *
 * Comparar contra ele quando o e-mail não existe faz a resposta levar o mesmo
 * tempo nos dois casos. Antes, o bcrypt só rodava para e-mails cadastrados e
 * ativos: a resposta para e-mail inexistente saía centenas de milissegundos mais
 * rápido, e bastava cronometrar o login para descobrir quem tem conta.
 */
let hashFicticio: Promise<string> | undefined;

function obterHashFicticio(): Promise<string> {
  hashFicticio ??= bcrypt.hash('senha-que-nao-pertence-a-ninguem', env.BCRYPT_ROUNDS);
  return hashFicticio;
}

export class LoginUseCase {
  constructor(
    private readonly authRepo: IAuthRepository,
    private readonly tokenService: ITokenService,
  ) {
    // Gera o hash fictício já na construção. Se ficasse para a primeira tentativa
    // com e-mail inexistente, essa tentativa pagaria o custo em dobro — e
    // reintroduziria a diferença de tempo que se quer eliminar.
    void obterHashFicticio();
  }

  async execute(input: LoginInput) {
    const usuario = await this.authRepo.buscarPorEmail(input.email);

    // O bcrypt roda SEMPRE — e-mail inexistente, usuário inativo ou senha errada —
    // e as três falhas devolvem a mesma mensagem.
    const hash = usuario?.senha || (await obterHashFicticio());
    const senhaValida = await bcrypt.compare(input.senha, hash);

    if (!usuario || !usuario.ativo || !senhaValida) throw new UnauthorizedError(MENSAGEM_FALHA);

    const token = this.tokenService.sign(
      { sub: usuario.id, email: usuario.email, role: usuario.role },
      env.JWT_EXPIRES_IN,
    );

    return {
      token,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, role: usuario.role },
    };
  }
}
