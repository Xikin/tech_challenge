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
    void obterHashFicticio();
  }

  async execute(input: LoginInput) {
    const usuario = await this.authRepo.buscarPorEmail(input.email);

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
