import type { Role } from "@prisma/client";

export interface UsuarioRecord {
  id: string;
  nome: string;
  email: string;
  senha: string;
  role: Role;
  ativo: boolean;
  criadoEm: Date;
}

export interface UsuarioPublico {
  id: string;
  nome: string;
  email: string;
  role: Role;
  ativo: boolean;
  criadoEm: Date;
}

export interface CriarUsuarioData {
  nome: string;
  email: string;
  senhaHash: string;
  role: Role;
}

export interface IAuthRepository {
  buscarPorEmail(email: string): Promise<UsuarioRecord | null>;
  criar(data: CriarUsuarioData): Promise<UsuarioPublico>;
  listar(): Promise<UsuarioPublico[]>;
}
