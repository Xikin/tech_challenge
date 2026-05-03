import { prisma } from "../../config/prisma";
import type { CriarUsuarioInput } from "./auth.schema";

export class AuthRepository {
  async buscarPorEmail(email: string) {
    return prisma.usuario.findUnique({ where: { email } });
  }

  async criar(data: CriarUsuarioInput & { senhaHash: string }) {
    return prisma.usuario.create({
      data: {
        nome: data.nome,
        email: data.email,
        senha: data.senhaHash,
        role: data.role,
      },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        criadoEm: true,
      },
    });
  }

  async listar() {
    return prisma.usuario.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        ativo: true,
        criadoEm: true,
      },
      orderBy: { nome: "asc" },
    });
  }
}
