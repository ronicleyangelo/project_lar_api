import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.service';

export class AdminController {
  public static async getMetrics(req: Request, res: Response) {
    try {
      const [totalUsers, totalClients, totalProviders, totalRequests, openRequests, totalQuotes, totalAppointments, activeAppointments, completedAppointments, totalReviews, pendingReviews, suspendedUsers] = await Promise.all([
        prisma.user.count(),
        prisma.clientProfile.count(),
        prisma.providerProfile.count(),
        prisma.serviceRequest.count(),
        prisma.serviceRequest.count({ where: { status: { in: ['OPEN', 'QUOTED'] } } }),
        prisma.quote.count(),
        prisma.appointment.count(),
        prisma.appointment.count({ where: { status: { in: ['SCHEDULED', 'IN_PROGRESS', 'AWAITING_CONFIRMATION'] } } }),
        prisma.appointment.count({ where: { status: 'COMPLETED' } }),
        prisma.review.count(),
        prisma.providerProfile.count({ where: { verificationStatus: 'PENDING_REVIEW' } }),
        prisma.user.count({ where: { status: 'SUSPENDED' } }),
      ]);

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
          activeAppointments,
          totalReviews,
          pendingReviews,
          suspendedUsers,
          conversionRate: `${conversionRate}%`,
          completionRate: `${completionRate}%`,
        },
      });
    } catch (error: any) {
      console.error('Erro ao obter métricas de administração:', error);
      return res.status(500).json({ error: 'Erro ao obter métricas de administração.' });
    }
  }

  public static async listProviders(req: Request, res: Response) {
    try {
      const providers = await prisma.providerProfile.findMany({
        include: {
          user: { select: { email: true, phone: true, status: true } },
          services: { include: { category: true } },
          coverageAreas: true,
          activities: { include: { activity: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return res.json(providers);
    } catch (error: any) {
      console.error('Erro ao listar profissionais:', error);
      return res.status(500).json({ error: 'Erro ao listar profissionais.' });
    }
  }

  public static async getProvider(req: Request, res: Response) {
    try {
      const provider = await prisma.providerProfile.findUnique({
        where: { id: req.params.id },
        include: {
          user: { select: { email: true, phone: true, status: true, emailVerified: true, phoneVerified: true, createdAt: true } },
          services: { include: { category: true } },
          coverageAreas: true,
          activities: { include: { activity: true } },
          availabilities: true,
        },
      });
      if (!provider) return res.status(404).json({ error: 'Profissional não encontrado.' });
      return res.json(provider);
    } catch (error: any) {
      console.error('Erro ao obter o profissional:', error);
      return res.status(500).json({ error: 'Erro ao obter o profissional.' });
    }
  }

  public static async reviewProvider(req: any, res: Response) {
    try {
      const { id } = req.params;
      const status = String(req.body.status || '');
      const note = String(req.body.note || '').trim();
      const allowed = new Set(['VERIFIED', 'CHANGES_REQUESTED', 'REJECTED']);
      if (!allowed.has(status)) return res.status(400).json({ error: 'Status de análise inválido.' });
      if (status !== 'VERIFIED' && !note) return res.status(400).json({ error: 'Informe o motivo da correção ou reprovação.' });
      const provider = await prisma.providerProfile.findUnique({ where: { id } });
      if (!provider) return res.status(404).json({ error: 'Profissional não encontrado.' });
      if (provider.verificationStatus !== 'PENDING_REVIEW') return res.status(409).json({ error: 'Este perfil não está aguardando análise.' });

      const updated = await prisma.providerProfile.update({
        where: { id },
        data: {
          verificationStatus: status,
          verificationNote: note || null,
          isVerified: status === 'VERIFIED',
          reviewedAt: new Date(),
          reviewedByUserId: req.user.userId,
        },
      });
      return res.json({ message: status === 'VERIFIED' ? 'Profissional aprovado.' : 'Análise registrada.', provider: updated });
    } catch (error: any) {
      console.error('Erro ao analisar profissional:', error);
      return res.status(500).json({ error: 'Erro ao analisar profissional.' });
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
      console.error('Erro ao verificar profissional:', error);
      return res.status(500).json({ error: 'Erro ao verificar profissional.' });
    }
  }
}
