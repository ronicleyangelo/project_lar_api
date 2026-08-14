import { Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.service';
import { APPOINTMENT_STATUS, assertAppointmentTransition, REQUEST_STATUS } from '../../domain/service-lifecycle';

const STATE_CHANGED = 'O estado deste agendamento mudou. Atualize a tela e tente novamente.';

export class AppointmentController {
  private static async getAppointmentForUser(id: string, userId: string) {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { client: true, provider: true, request: true },
    });
    if (!appointment) return { error: 'NOT_FOUND' as const };
    if (appointment.client.userId !== userId && appointment.provider.userId !== userId) {
      return { error: 'FORBIDDEN' as const };
    }
    return { appointment };
  }

  public static async startAppointment(req: any, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const result = await AppointmentController.getAppointmentForUser(id, userId);
      if ('error' in result) {
        return res.status(result.error === 'NOT_FOUND' ? 404 : 403).json({ error: 'Agendamento não encontrado ou acesso negado.' });
      }
      const { appointment } = result;
      if (appointment.provider.userId !== userId) {
        return res.status(403).json({ error: 'Somente o profissional pode iniciar o serviço.' });
      }
      assertAppointmentTransition(appointment.status, APPOINTMENT_STATUS.IN_PROGRESS);

      const updated = await prisma.$transaction(async (tx) => {
        const changed = await tx.appointment.updateMany({
          where: { id, status: appointment.status },
          data: { status: APPOINTMENT_STATUS.IN_PROGRESS },
        });
        if (changed.count !== 1) throw new Error(STATE_CHANGED);
        await tx.auditLog.create({ data: { userId, action: 'APPOINTMENT_STARTED', resource: `Appointment:${id}` } });
        return tx.appointment.findUniqueOrThrow({ where: { id } });
      });
      return res.json({ message: 'Serviço iniciado.', appointment: updated });
    } catch (error: any) {
      return res.status(409).json({ error: error.message });
    }
  }

  public static async completeAppointment(req: any, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const result = await AppointmentController.getAppointmentForUser(id, userId);
      if ('error' in result) {
        return res.status(result.error === 'NOT_FOUND' ? 404 : 403).json({ error: 'Agendamento não encontrado ou acesso negado.' });
      }
      const { appointment } = result;
      if (appointment.provider.userId !== userId) {
        return res.status(403).json({ error: 'Somente o profissional pode informar que o serviço foi executado.' });
      }
      assertAppointmentTransition(appointment.status, APPOINTMENT_STATUS.AWAITING_CONFIRMATION);

      const updated = await prisma.$transaction(async (tx) => {
        const changed = await tx.appointment.updateMany({
          where: { id, status: appointment.status },
          data: { status: APPOINTMENT_STATUS.AWAITING_CONFIRMATION },
        });
        if (changed.count !== 1) throw new Error(STATE_CHANGED);
        await tx.auditLog.create({ data: { userId, action: 'COMPLETION_REQUESTED', resource: `Appointment:${id}` } });
        return tx.appointment.findUniqueOrThrow({ where: { id } });
      });
      return res.json({ message: 'Execução informada. Aguardando confirmação do cliente.', appointment: updated });
    } catch (error: any) {
      return res.status(409).json({ error: error.message });
    }
  }

  public static async confirmCompletion(req: any, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const result = await AppointmentController.getAppointmentForUser(id, userId);
      if ('error' in result) {
        return res.status(result.error === 'NOT_FOUND' ? 404 : 403).json({ error: 'Agendamento não encontrado ou acesso negado.' });
      }
      const { appointment } = result;
      if (appointment.client.userId !== userId) {
        return res.status(403).json({ error: 'Somente o cliente pode confirmar a conclusão.' });
      }
      assertAppointmentTransition(appointment.status, APPOINTMENT_STATUS.COMPLETED);

      const updated = await prisma.$transaction(async (tx) => {
        const changed = await tx.appointment.updateMany({
          where: { id, status: appointment.status },
          data: { status: APPOINTMENT_STATUS.COMPLETED },
        });
        if (changed.count !== 1) throw new Error(STATE_CHANGED);
        await tx.serviceRequest.update({
          where: { id: appointment.requestId },
          data: { status: REQUEST_STATUS.COMPLETED, deduplicationKey: null },
        });
        await tx.auditLog.create({ data: { userId, action: 'COMPLETION_CONFIRMED', resource: `Appointment:${id}` } });
        return tx.appointment.findUniqueOrThrow({ where: { id } });
      });
      return res.json({ message: 'Serviço concluído e liberado para avaliação.', appointment: updated });
    } catch (error: any) {
      return res.status(409).json({ error: error.message });
    }
  }

  public static async listAppointments(req: any, res: Response) {
    try {
      const userId = req.user.userId;
      const role = req.user.role;
      if (role === 'CLIENT') {
        const client = await prisma.clientProfile.findUnique({ where: { userId } });
        if (!client) return res.status(400).json({ error: 'Perfil de cliente não encontrado.' });
        const appointments = await prisma.appointment.findMany({
         …3080 tokens truncated…n            price: parsedPrice,
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
      return res.status(500).json({ error: 'Erro ao enviar proposta.', details: error.message });
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
        return res.status(403).json({ error: 'Voce nao tem permissao para aceitar este orcamento.' });
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
      return res.status(500).json({ error: 'Erro ao aceitar orcamento.', details: error.message });
    }
  }
}
