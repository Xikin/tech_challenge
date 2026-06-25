export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
}

export interface ITokenService {
  sign(payload: TokenPayload, expiresIn: string): string;
}
