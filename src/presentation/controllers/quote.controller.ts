import { Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.service';
import { canAcceptQuote, canReceiveQuote, QUOTE_STATUS, REQUEST_STATUS } from '../../domain/service-lifecycle';
import { providerCoversRequest } from '../../domain/provider-coverage.policy';

export class QuoteController {
  public static async sendQuote(req: any, res: Response) {
    try {
      const userId = req.user.userId;
      const { requestId, price, estimatedDuration, message } = req.body;
      const parsedPrice = Number(price);

      if (!requestId || !Number.isFinite(parsedPrice) || parsedPrice <= 0 || !estimatedDuration || !message?.trim()) {
        return res.status(400).json({ error: 'Preencha todos os campos da proposta.' });
      }

      const provider = await prisma.providerProfile.findUnique({
        where: { userId },
        include: { services: true, coverageAreas: true },
      });
      if (!provider) return res.status(400).json({ error: 'Perfil de profissional nao encontrado.' });
      if (provider.verificationStatus !== 'VERIFIED') {
        return res.status(403).json({ error: 'Seu perfil precisa ser aprovado antes de enviar propostas.' });
      }

      const requestItem = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
      if (!requestItem) return res.status(404).json({ error: 'Solicitacao nao encontrada.' });
      if (!canReceiveQuote(requestItem.status)) {
        return res.status(409).json({ error: 'Esta solicitacao nao esta mais recebendo propostas.' });
      }
      if (!provider.services.some((service) => service.categoryId === requestItem.categoryId)) {
        return res.status(403).json({ error: 'O profissional nao oferece a categoria solicitada.' });
      }

      const coversRequest = providerCoversRequest(provider.serviceRadiusKm, provider.coverageAreas, requestItem);
      if (!coversRequest) {
        return res.status(403).json({ error: 'O pedido esta fora da area de atendimento cadastrada.' });
      }

      const existingQuote = await prisma.quote.findFirst({ where: { requestId, providerId: provider.id } });
      if (existingQuote) return res.status(409).json({ error: 'Voce ja enviou uma proposta para este pedido.' });

      const quote = await prisma.$transaction(async (tx) => {
        const created = await tx.quote.create({
          data: {
            requestId,
            providerId: provider.id,
            price: parsedPrice,
            estimatedDuration,
            message: message.trim(),
          },
        });
        await tx.serviceRequest.update({ where: { id: requestId }, data: { status: REQUEST_STATUS.QUOTED } });
        await tx.auditLog.create({
          data: { userId, action: 'QUOTE_SENT', resource: `Quote:${created.id}`, details: `Request:${requestId}` },
        });
        return created;
      });

      return res.status(201).json({ message: 'Proposta enviada com sucesso!', quote });
    } catch (error: any) {
      if (error.code === 'P2002') return res.status(409).json({ error: 'Voce ja enviou uma proposta para este pedido.' });
      console.error('Erro ao enviar proposta:', error);
      return res.status(500).json({ error: 'Erro ao enviar proposta.' });
    }
  }

  public static async acceptQuote(req: any, res: Response) {
    try {
      const { quoteId } = req.params;
      const userId = req.user.userId;
      const client = await prisma.clientProfile.findUnique({ where: { userId } });
      if (!client) return res.status(400).json({ error: 'Perfil de cliente nao encontrado.' });

      const quote = await prisma.quote.findUnique({
        where: { id: quoteId },
        include: { request: true, provider: true },
      });
      if (!quote) return res.status(404).json({ error: 'Orcamento nao encontrado.' });
      if (quote.request.clientId !== client.id) {
        return res.status(404).json({ error: 'Orcamento nao encontrado.' });
      }
      if (!canAcceptQuote(quote.request.status, quote.status)) {
        return res.status(409).json({ error: 'Esta proposta nao pode mais ser aceita.' });
      }

      const appointment = await prisma.$transaction(async (tx) => {
        const currentRequest = await tx.serviceRequest.findUnique({ where: { id: quote.requestId } });
        const currentQuote = await tx.quote.findUnique({ where: { id: quoteId } });
        if (!currentRequest || !currentQuote || !canAcceptQuote(currentRequest.status, currentQuote.status)) {
          throw new Error('QUOTE_NO_LONGER_AVAILABLE');
        }

        await tx.quote.update({ where: { id: quoteId }, data: { status: QUOTE_STATUS.ACCEPTED } });
        await tx.quote.updateMany({
          where: { requestId: quote.requestId, id: { not: quoteId }, status: QUOTE_STATUS.PENDING },
          data: { status: QUOTE_STATUS.REJECTED },
        });
        await tx.serviceRequest.update({
          where: { id: quote.requestId },
          data: { status: REQUEST_STATUS.ACCEPTED },
        });
        const created = await tx.appointment.create({
          data: {
            requestId: quote.requestId,
            quoteId: quote.id,
            clientId: client.id,
            providerId: quote.providerId,
            scheduledAt: quote.request.scheduledDate,
            status: 'SCHEDULED',
          },
          include: { client: true, provider: true, request: true },
        });
        await tx.auditLog.create({
          data: { userId, action: 'QUOTE_ACCEPTED', resource: `Quote:${quoteId}`, details: `Appointment:${created.id}` },
        });
        return created;
      });

      return res.json({
        message: 'Orcamento aceito e agendamento confirmado. O endereco completo foi liberado ao profissional.',
        appointment,
        revealedClientAddress: client.fullAddress,
      });
    } catch (error: any) {
      if (error.message === 'QUOTE_NO_LONGER_AVAILABLE' || error.code === 'P2002') {
        return res.status(409).json({ error: 'Outra proposta ja foi aceita para este pedido.' });
      }
      console.error('Erro ao aceitar orçamento:', error);
      return res.status(500).json({ error: 'Erro ao aceitar orçamento.' });
    }
  }
}
