import crypto from 'crypto';

type JsonRecord = Record<string, any>;

export class MercadoPagoService {
  private static readonly API_URL = 'https://api.mercadopago.com';

  private static required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Configuração ausente: ${name}`);
    return value;
  }

  static createOAuthData() {
    const state = crypto.randomBytes(32).toString('base64url');
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const params = new URLSearchParams({
      client_id: this.required('MERCADO_PAGO_CLIENT_ID'),
      response_type: 'code', platform_id: 'mp', state,
      redirect_uri: this.required('MERCADO_PAGO_REDIRECT_URI'),
      code_challenge: challenge, code_challenge_method: 'S256',
    });
    return { state, verifier, authorizationUrl: `https://auth.mercadopago.com/authorization?${params}` };
  }

  static async exchangeCode(code: string, verifier: string): Promise<JsonRecord> {
    return this.request('/oauth/token', undefined, {
      method: 'POST',
      body: JSON.stringify({
        client_id: this.required('MERCADO_PAGO_CLIENT_ID'),
        client_secret: this.required('MERCADO_PAGO_CLIENT_SECRET'),
        grant_type: 'authorization_code', code,
        redirect_uri: this.required('MERCADO_PAGO_REDIRECT_URI'),
        code_verifier: verifier,
        test_token: String(process.env.MERCADO_PAGO_TEST_MODE !== 'false'),
      }),
    });
  }

  static async createPreference(accessToken: string, body: JsonRecord): Promise<JsonRecord> {
    return this.request('/checkout/preferences', accessToken, { method: 'POST', body: JSON.stringify(body) });
  }

  static async getPayment(accessToken: string, paymentId: string): Promise<JsonRecord> {
    return this.request(`/v1/payments/${encodeURIComponent(paymentId)}`, accessToken);
  }

  static validateWebhook(signature: string | undefined, requestId: string | undefined, dataId: string): boolean {
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim();
    if (!secret || !signature || !requestId || !dataId) return false;
    const parts = Object.fromEntries(signature.split(',').map(part => part.trim().split('=', 2)));
    if (!parts.ts || !parts.v1) return false;
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
    const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    const received = Buffer.from(parts.v1, 'hex');
    const calculated = Buffer.from(expected, 'hex');
    return received.length === calculated.length && crypto.timingSafeEqual(received, calculated);
  }

  private static async request(path: string, accessToken?: string, init: RequestInit = {}): Promise<JsonRecord> {
    const response = await fetch(`${this.API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json() as JsonRecord;
    if (!response.ok) {
      console.error('[MercadoPago] API error', { path, status: response.status, message: data.message });
      throw new Error('MERCADO_PAGO_REQUEST_FAILED');
    }
    return data;
  }
}
