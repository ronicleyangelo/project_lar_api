import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.service';
import { EncryptionUtil } from '../../infrastructure/security/encryption.util';
import { MercadoPagoService } from '../../infrastructure/payments/mercado-pago.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

const OAUTH_TTL_MS = 10 * 60 * 1000;
const paymentStatus = (status: string): string => ({
  approved: 'APPROVED', pending: 'PENDING', in_process: 'PROCESSING', rejected: 'REJECTED',
  cancelled: 'CANCELLED', refunded: 'REFUNDED', charged_back: 'CHARGED_BACK',
}[status] || 'PENDING');

export class PaymentController {
  static async connectionStatus(req: AuthenticatedRequest, res: Response) {
    const provider = await prisma.providerProfile.findUnique({
      where: { userId: req.user!.userId },
      include: { mercadoPagoConnection: true },
    });
    if (!provider) return res.status(404).json({ error: 'Perfil profissional não encontrado.' });
    return res.json({ connected: !!provider.mercadoPagoConnection, testMode: provider.mercadoPagoConnection?.testMode ?? true });
  }

  static async connect(req: AuthenticatedRequest, res: Response) {
    try {
      const provider = await prisma.providerProfile.findUnique({ where: { userId: req.user!.userId }, select: { id: true } });
      if (!provider) return res.status(404).json({ error: 'Perfil profissional não encontrado.' });
      const oauth = MercadoPagoService.createOAuthData();
      await prisma.mercadoPagoOAuthState.create({
        data: {
          state: oauth.state,
          providerId: provider.id,
          encryptedVerifier: EncryptionUtil.encrypt(oauth.verifier)!,
          expiresAt: new Date(Date.now() + OAUTH_TTL_MS),
        },
      });
      return res.json({ authorizationUrl: oauth.authorizationUrl });
    } catch (error) {
      console.error('[Payment] Falha ao iniciar OAuth:', error);
      return res.status(503).json({ error: 'Mercado Pago ainda não está configurado.' });
    }
  }

  static async callback(req: Request, res: Response) {
    const frontend = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:4200';
    const redirect = (result: string) => res.redirect(`${frontend}/provider?mercadoPago=${result}`);
    try {
      const code = String(req.query.code || '');
      const stateValue = String(req.query.state || '');
      if (!code || !stateValue) return redirect('error');

      const state = await prisma.mercadoPagoOAuthState.findUnique({ where: { state: stateValue } });
      if (!state || state.expiresAt <= new Date()) return redirect('expired');
      await prisma.mercadoPagoOAuthState.delete({ where: { state: stateValue } });

      const verifier = EncryptionUtil.decrypt(state.encryptedVerifier);
      if (!verifier) return redirect('error');
      const tokens = await MercadoPagoService.exchangeCode(code, verifier);
      const expiresAt = tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000) : null;
      await prisma.mercadoPagoConnection.upsert({
        where: { providerId: state.providerId },
        update: {
          mercadoPagoUserId: String(tokens.user_id),
          encryptedAccessToken: EncryptionUtil.encrypt(tokens.access_token)!,
          encryptedRefreshToken: EncryptionUtil.encrypt(tokens.refresh_token), expiresAt,
          testMode: process.env.MERCADO_PAGO_TEST_MODE !== 'false',
        },
        create: {
          providerId: state.providerId, mercadoPagoUserId: String(tokens.user_id),
          encryptedAccessToken: EncryptionUtil.encrypt(tokens.access_token)!,
          encryptedRefreshToken: EncryptionUtil.encrypt(tokens.refresh_token), expiresAt,
          testMode: process.env.MERCADO_PAGO_TEST_MODE !== 'false',
        },
      });
      return redirect('connected');
    } catch (error) {
      console.error('[Payment] Falha no callback OAuth:', error);
      return redirect('error');
    }
  }

  static async createCheckout(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const appointmentId = req.params.id;
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: { client: true, provider: { include: { mercadoPagoConnection: true } }, quote: true, payment: true },
      });
      if (!appointment || appointment.client.userId !== userId) return res.status(404).json({ error: 'Agendamento não encontrado.' });
      if (!appointment.provider.mercadoPagoConnection) {
        return res.status(409).json({ error: 'O profissional ainda não conectou o Mercado Pago.' });
      }
      if (appointment.payment?.status === 'APPROVED') return res.status(409).json({ error: 'Este serviço já está pago.' });
      if (appointment.status !== 'SCHEDULED') return res.status(409).json({ error: 'O pagamento deve ser realizado antes do início do serviço.' });
      if (appointment.payment?.checkoutUrl) {
        return res.json({ checkoutUrl: appointment.payment.checkoutUrl, payment: appointment.payment });
      }

      const amount = Math.round(appointment.quote.price * 100) / 100;
      const rate = Math.min(30, Math.max(0, Number(process.env.PLATFORM_FEE_PERCENT || 12)));
      const platformFee = Math.round(amount * rate) / 100;
      const payment = appointment.payment || await prisma.marketplacePayment.create({
        data: { appointmentId, providerId: appointment.providerId, amount, platformFee, providerAmount: amount - platformFee },
      });
      const accessToken = EncryptionUtil.decrypt(appointment.provider.mercadoPagoConnection.encryptedAccessToken);
      if (!accessToken) throw new Error('INVALID_SELLER_TOKEN');
      const frontend = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:4200';
      const backend = process.env.BACKEND_URL?.trim() || 'http://localhost:3000';
      const preference = await MercadoPagoService.createPreference(accessToken, {
        items: [{ id: appointment.id, title: `Serviço Projeto Lar #${appointment.id.slice(0, 8)}`, currency_id: 'BRL', quantity: 1, unit_price: amount }],
        marketplace_fee: platformFee,
        external_reference: payment.id,
        notification_url: `${backend}/api/payments/mercado-pago/webhook`,
        back_urls: { success: `${frontend}/client?payment=success`, pending: `${frontend}/client?payment=pending`, failure: `${frontend}/client?payment=failure` },
        auto_return: 'approved',
      });
      const testMode = appointment.provider.mercadoPagoConnection.testMode;
      const checkoutUrl = testMode ? preference.sandbox_init_point : preference.init_point;
      if (!checkoutUrl) throw new Error('CHECKOUT_URL_NOT_RETURNED');
      const updated = await prisma.marketplacePayment.update({
        where: { id: payment.id },
        data: { mercadoPagoPreferenceId: String(preference.id), checkoutUrl, testMode },
      });
      return res.status(201).json({ checkoutUrl, payment: updated });
    } catch (error) {
      console.error('[Payment] Falha ao criar checkout:', error);
      return res.status(502).json({ error: 'Não foi possível iniciar o pagamento.' });
    }
  }

  static async webhook(req: Request, res: Response) {
    try {
      const dataId = String(req.query['data.id'] || req.body?.data?.id || '');
      if (!MercadoPagoService.validateWebhook(req.header('x-signature'), req.header('x-request-id'), dataId)) {
        return res.status(401).json({ error: 'Assinatura inválida.' });
      }
      if (String(req.query.type || req.body?.type || '') !== 'payment') return res.sendStatus(200);
      const connection = await prisma.mercadoPagoConnection.findUnique({ where: { mercadoPagoUserId: String(req.body?.user_id || '') } });
      if (!connection) return res.sendStatus(200);
      const accessToken = EncryptionUtil.decrypt(connection.encryptedAccessToken);
      if (!accessToken) return res.sendStatus(200);
      const remote = await MercadoPagoService.getPayment(accessToken, dataId);
      const local = await prisma.marketplacePayment.findUnique({ where: { id: String(remote.external_reference || '') } });
      if (!local || local.providerId !== connection.providerId || Number(remote.transaction_amount) !== local.amount) {
        console.error('[Payment] Webhook não corresponde ao pagamento local.', { dataId });
        return res.sendStatus(200);
      }
      const status = paymentStatus(String(remote.status));
      await prisma.$transaction([
        prisma.marketplacePayment.update({
          where: { id: local.id },
          data: { status, mercadoPagoPaymentId: String(remote.id), approvedAt: status === 'APPROVED' ? new Date(remote.date_approved || Date.now()) : null },
        }),
        prisma.auditLog.create({ data: { action: 'PAYMENT_STATUS_UPDATED', resource: `Payment:${local.id}`, details: status } }),
      ]);
      return res.sendStatus(200);
    } catch (error) {
      console.error('[Payment] Falha ao processar webhook:', error);
      return res.sendStatus(500);
    }
  }
}
