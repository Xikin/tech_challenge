import bcrypt from "bcryptjs";
import { ConflictError } from "../../../shared/errors";
import type { IAuthRepository, CriarUsuarioData } from "../../../domain/repositories/auth.repository.interface";
import type { Role } from "@prisma/client";
import { env } from "../../../config/env";

export interface CriarUsuarioInput {
  nome: string;
  email: string;
  senha: string;
  role: Role;
}

export class CriarUsuarioUseCase {
  constructor(private readonly authRepo: IAuthRepository) {}

  async execute(input: CriarUsuarioInput) {
    const existe = await this.authRepo.buscarPorEmail(input.email);
    if (existe) throw new ConflictError("Email já cadastrado");

    const senhaHash = await bcrypt.hash(input.senha, env.BCRYPT_ROUNDS);
    const data: CriarUsuarioData = {
      nome: input.nome,
      email: input.email,
      senhaHash,
      role: input.role,
    };
    return this.authRepo.criar(data);
  }
}
