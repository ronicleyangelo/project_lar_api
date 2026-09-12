import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export interface GoogleOnboardingPayload {
  purpose: 'GOOGLE_ONBOARDING';
  googleId: string;
  email: string;
  fullName: string;
  picture?: string;
  existingUserId?: string;
}

export class JwtProvider {
  private static get secret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET deve ser configurado com pelo menos 32 caracteres.');
    }
    return secret;
  }

  public static assertConfigured(): void {
    void this.secret;
  }

  public static generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, this.secret, {
      expiresIn: '7d',
    });
  }

  public static verifyToken(token: string): TokenPayload {
    return jwt.verify(token, this.secret) as TokenPayload;
  }

  public static generateGoogleOnboardingToken(payload: Omit<GoogleOnboardingPayload, 'purpose'>): string {
    return jwt.sign({ ...payload, purpose: 'GOOGLE_ONBOARDING' }, this.secret, { expiresIn: '30m' });
  }

  public static verifyGoogleOnboardingToken(token: string): GoogleOnboardingPayload {
    const payload = jwt.verify(token, this.secret) as GoogleOnboardingPayload;
    if (payload.purpose !== 'GOOGLE_ONBOARDING') {
      throw new Error('Token de conclusão inválido.');
    }
    return payload;
  }
}
