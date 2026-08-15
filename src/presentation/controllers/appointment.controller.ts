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
          where: { clientId: client.id },
          include: { provider: true, request: { include: { category: true } }, review: true },
          orderBy: { createdAt: 'desc' }
        });
        return res.json(appointments);
      } else {
        const provider = await prisma.providerProfile.findUnique({ where: { userId } });
        if (!provider) return res.status(400).json({ error: 'Perfil de profissional não encontrado.' });
        const appointments = await prisma.appointment.findMany({
          where: { providerId: provider.id },
          include: { client: true, request: { include: { category: true } }, review: true },
          orderBy: { createdAt: 'desc' }
        });
        return res.json(appointments);
      }
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }
}
