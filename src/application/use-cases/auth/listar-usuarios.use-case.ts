import type { IAuthRepository } from "../../../domain/repositories/auth.repository.interface";

export class ListarUsuariosUseCase {
  constructor(private readonly authRepo: IAuthRepository) {}

  async execute() {
    return this.authRepo.listar();
  }
}
