import bcrypt from "bcryptjs";
import { FastifyInstance } from "fastify";
import { ConflictError, UnauthorizedError } from "../../shared/errors";
import { AuthRepository } from "./auth.repository";
import { env } from "../../config/env";
import type { LoginInput, CriarUsuarioInput } from "./auth.schema";

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly fastify: FastifyInstance,
  ) {}

  async login(data: LoginInput) {
    const usuario = await this.repo.buscarPorEmail(data.email);
    if (!usuario || !usuario.ativo) throw new UnauthorizedError("Email ou senha inválidos");

    const senhaValida = await bcrypt.compare(data.senha, usuario.senha);
    if (!senhaValida) throw new UnauthorizedError("Email ou senha inválidos");

    const token = this.fastify.jwt.sign(
      { sub: usuario.id, email: usuario.email, role: usuario.role },
      { expiresIn: env.JWT_EXPIRES_IN },
    );

    return {
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role,
      },
    };
  }

  async criarUsuario(data: CriarUsuarioInput) {
    const existe = await this.repo.buscarPorEmail(data.email);
    if (existe) throw new ConflictError("Email já cadastrado");

    const senhaHash = await bcrypt.hash(data.senha, env.BCRYPT_ROUNDS);
    return this.repo.criar({ ...data, senhaHash });
  }

  async listarUsuarios() {
    return this.repo.listar();
  }
}
