import bcrypt from 'bcryptjs';
import { UnauthorizedError } from '../../../shared/errors';
import type { IAuthRepository } from '../../../domain/repositories/auth.repository.interface';
import type { ITokenService } from '../../../domain/services/token.service.interface';
import { env } from '../../../config/env';

export interface LoginInput {
  email: string;
  senha: string;
}

export class LoginUseCase {
  constructor(
    private readonly authRepo: IAuthRepository,
    private readonly tokenService: ITokenService,
  ) {}

  async execute(input: LoginInput) {
    const usuario = await this.authRepo.buscarPorEmail(input.email);
    if (!usuario || !usuario.ativo) throw new UnauthorizedError('Email ou senha inválidos');

    const senhaValida = await bcrypt.compare(input.senha, usuario.senha);
    if (!senhaValida) throw new UnauthorizedError('Email ou senha inválidos');

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
