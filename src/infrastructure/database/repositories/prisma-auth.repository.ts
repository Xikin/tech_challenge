import { prisma } from "../../../config/prisma";
import type { IAuthRepository, UsuarioRecord, UsuarioPublico, CriarUsuarioData } from "../../../domain/repositories/auth.repository.interface";

export class PrismaAuthRepository implements IAuthRepository {
  async buscarPorEmail(email: string): Promise<UsuarioRecord | null> {
    return prisma.usuario.findUnique({ where: { email } }) as Promise<UsuarioRecord | null>;
  }

  async criar(data: CriarUsuarioData): Promise<UsuarioPublico> {
    return prisma.usuario.create({
      data: { nome: data.nome, email: data.email, senha: data.senhaHash, role: data.role },
      select: { id: true, nome: true, email: true, role: true, ativo: true, criadoEm: true },
    });
  }

  async listar(): Promise<UsuarioPublico[]> {
    return prisma.usuario.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, email: true, role: true, ativo: true, criadoEm: true },
      orderBy: { nome: "asc" },
    });
  }
}
