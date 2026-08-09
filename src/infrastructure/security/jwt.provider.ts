import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export class JwtProvider {
  private static get secret(): string {
    return process.env.JWT_SECRET || 'fallback_secret_key_2026';
  }

  public static generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, this.secret, {
      expiresIn: '7d',
    });
  }

  public static verifyToken(token: string): TokenPayload {
    return jwt.verify(token, this.secret) as TokenPayload;
  }
}
