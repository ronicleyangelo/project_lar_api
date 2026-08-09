import { Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.service';
import { APPOINTMENT_STATUS, assertAppointmentTransition, REQUEST_STATUS } from '../../domain/service-lifecycle';

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
        return res.status(result.error === 'NOT_FOUND' ? 404 : 403).json({ error: 'Agendamento nao encontrado ou acesso negado.' });
      }
      const { appointment } = result;
      if (appointment.provider.userId !== userId) {
        return res.status(403).json({ error: 'Somente o profissional pode iniciar o servico.' });
      }
      assertAppointmentTransition(appointment.status, APPOINTMENT_STATUS.IN_PROGRESS);

      const updated = await prisma.$transaction(async (tx) => {
        const item = await tx.appointment.update({ where: { id }, data: { status: APPOINTMENT_STATUS.IN_PROGRESS } });
        await tx.auditLog.create({ data: { userId, action: 'APPOINTMENT_STARTED', resource: `Appointment:${id}` } });
        return item;
      });
      return res.json({ message: 'Servico iniciado.', appointment: updated });
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
        return res.status(result.error === 'NOT_FOUND' ? 404 : 403).json({ error: 'Agendamento nao encontrado ou acesso negado.' });
      }
      const { appointment } = result;
      if (appointment.provider.userId !== userId) {
        return res.status(403).json({ error: 'Somente o profissional pode informar que o servico foi executado.' });
      }
      assertAppointmentTransition(appointment.status, APPOINTMENT_STATUS.AWAITING_CONFIRMATION);

      const updated = await prisma.$transaction(async (tx) => {
        const item = await tx.appointment.update({
          where: { id },
          data: { status: APPOINTMENT_STATUS.AWAITING_CONFIRMATION },
        });
        await tx.auditLog.create({ data: { userId, action: 'COMPLETION_REQUESTED', resource: `Appointment:${id}` } });
        return item;
      });
      return res.json({ message: 'Execucao informada. Aguardando confirmacao do cliente.', appointment: updated });
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
        return res.status(result.error === 'NOT_FOUND' ? 404 : 403).json({ error: 'Agendamento nao encontrado ou acesso negado.' });
      }
      const { appointment } = result;
      if (appointment.client.userId !== userId) {
        return res.status(403).json({ error: 'Somente o cliente pode confirmar a conclusao.' });
      }
      assertAppointmentTransition(appointment.status, APPOINTMENT_STATUS.COMPLETED);

      const updated = await prisma.$transaction(async (tx) => {
        const item = await tx.appointment.update({ where: { id }, data: { status: APPOINTMENT_STATUS.COMPLETED } });
        await tx.serviceRequest.update({ where: { id: appointment.requestId }, data: { status: REQUEST_STATUS.COMPLETED } });
        await tx.auditLog.create({ data: { userId, action: 'COMPLETION_CONFIRMED', resource: `Appointment:${id}` } });
        return item;
      });
      return res.json({ message: 'Servico concluido e liberado para avaliacao.', appointment: updated });
    } catch (error: any) {
      return res.status(409).json({ error: error.message });
    }
  }

  public static async listAppointments(req: any, res: Response) {
    try {
      const userId = req.user.userId;
      const role = req.user.role;
      let appointments;

      if (role === 'CLIENT') {
        const client = await prisma.clientProfile.findUnique({ where: { userId } });
        if (!client) return res.status(400).json({ error: 'Perfil de cliente nao encontrado.' });
        appointments = await prisma.appointment.findMany({
          where: { clientId: client.id },
          include: { provider: true, request: true, review: true, quote: true },
          orderBy: { createdAt: 'desc' },
        });
      } else {
        const provider = await prisma.providerProfile.findUnique({ where: { userId } });
        if (!provider) return res.status(400).json({ error: 'Perfil de profissional nao encontrado.' });
        appointments = await prisma.appointment.findMany({
          where: { providerId: provider.id },
          include: { client: true, request: true, review: true, quote: true },
          orderBy: { createdAt: 'desc' },
        });
      }
      return res.json(appointments);
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao listar agendamentos.', details: error.message });
    }
  }
}
