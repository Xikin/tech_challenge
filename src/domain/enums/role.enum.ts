export type Role = 'ADMIN' | 'FUNCIONARIO';

export type RoleToken = Role | 'CLIENTE';

export const ROLES_INTERNOS: readonly RoleToken[] = ['ADMIN', 'FUNCIONARIO'];
