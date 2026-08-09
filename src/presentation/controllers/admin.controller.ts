import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.service';

export class AdminController {
  public static async getMetrics(req: Request, res: Response) {
    try {
      const totalUsers = await prisma.user.count();
      const totalClients = await prisma.clientProfile.count();
      const totalProviders = await prisma.providerProfile.count();
      const totalRequests = await prisma.serviceRequest.count();
      const openRequests = await prisma.serviceRequest.count({ where: { status: { in: ['OPEN', 'QUOTED'] } } });
      const totalQuotes = await prisma.quote.count();
      const totalAppointments = await prisma.appointment.count();
      const completedAppointments = await prisma.appointment.count({ where: { status: 'COMPLETED' } });
      const totalReviews = await prisma.review.count();

      // Calculation of Pilot Success Metrics from PDF Page 11
      const conversionRate = totalRequests > 0 ? Math.round((totalAppointments / totalRequests) * 100) : 0;
      const completionRate = totalAppointments > 0 ? Math.round((completedAppointments / totalAppointments) * 100) : 0;

      return res.json({
        metrics: {
          totalUsers,
          totalClients,
          totalProviders,
          totalRequests,
          openRequests,
          totalQuotes,
          totalAppointments,
          completedAppointments,
          totalReviews,
          conversionRate: `${conversionRate}%`,
          completionRate: `${completionRate}%`,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao obter métricas de administração.', details: error.message });
    }
  }

  public static async listProviders(req: Request, res: Response) {
    try {
      const providers = await prisma.providerProfile.findMany({
        include: {
          user: { select: { email: true, phone: true, status: true } },
          services: { include: { category: true } },
          coverageAreas: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      return res.json(providers);
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao listar profissionais.', details: error.message });
    }
  }

  public static async verifyProvider(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { isVerified } = req.body;

      const updated = await prisma.providerProfile.update({
        where: { id },
        data: { isVerified: Boolean(isVerified) },
      });

      return res.json({ message: 'Selo de verificação atualizado com sucesso!', provider: updated });
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao verificar profissional.', details: error.message });
    }
  }
}
