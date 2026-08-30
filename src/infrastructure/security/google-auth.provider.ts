import { OAuth2Client } from 'google-auth-library';

export interface GoogleIdentity {
  googleId: string;
  email: string;
  fullName: string;
  picture?: string;
}

export class GoogleAuthProvider {
  private static readonly client = new OAuth2Client();

  public static async verifyIdToken(idToken: string): Promise<GoogleIdentity> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error('GOOGLE_CLIENT_ID não configurado no servidor.');
    }

    const ticket = await this.client.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new Error('A conta Google não possui um e-mail verificado.');
    }

    return {
      googleId: payload.sub,
      email: payload.email.trim().toLowerCase(),
      fullName: payload.name?.trim() || payload.email.split('@')[0],
      picture: payload.picture,
    };
  }
}
