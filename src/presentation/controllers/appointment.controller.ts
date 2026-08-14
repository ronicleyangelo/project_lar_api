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
        return res.status(result.error === 'NOT_FOUND' ? 404 : 403).json({ error: 'Agendamento n√£o encontrado ou acesso negado.' });
      }
      const { appointment } = result;
      if (appointment.provider.userId !== userId) {
        return res.status(403).json({ error: 'Somente o profissional pode iniciar o servi√ßo.' });
      }
      assertAppointmentTransition(appointment.status, APPOINTMENT_STATUS.IN_PROGRESS);

      const updated = await prisma.$transaction(async (tx) => {
        const changed = await tx.appointment.updateMany({
          where: { id, status: appointment.status },
          data: { status: APPOINTMENT_STATUS.IN_PROGRESS },
        });
        if (changed.count !== 1) throw new Error(STATE_CHANGED);
        await tx.auditLog.create({ data: { userId, action: 'APPOINTz€ùÌ¢Gß≤⁄Óù∆≠y–     }
      return res.status(500).json({ error: 'Erro ao aceitar orcamento.', details: error.message });
    }
  }
}
