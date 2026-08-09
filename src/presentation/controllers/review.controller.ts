import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.service';
import { ReputationEngine } from '../../infrastructure/ranking/reputation.engine';

export class ReviewController {
  public static async createReview(req: any, res: Response) {
    try {
      const userId = req.user.userId;
      const {
        appointmentId,
        qualityRating,
        punctualityRating,
        communicationRating,
        careRating,
        costBenefitRating,
        comment,
      } = req.body;

      if (
        !appointmentId ||
        !qualityRating ||
        !punctualityRating ||
        !communicationRating ||
        !careRating ||
        !costBenefitRating
      ) {
        return res.status(400).json({ error: 'Preencha as 5 notas do formulário de avaliação.' });
      }

      const client = await prisma.clientProfile.findUnique({ where: { userId } });
      if (!client) {
        return res.status(400).json({ error: 'Perfil de cliente não encontrado.' });
      }

      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: { review: true },
      });

      if (!appointment) {
        return res.status(404).json({ error: 'Agendamento não encontrado.' });
      }

      if (appointment.clientId !== client.id) {
        return res.status(403).json({ error: 'Você só pode avaliar serviços contratados por você.' });
      }

      if (appointment.status !== 'COMPLETED') {
        return res.status(400).json({
          error: 'Regra de Confiança: Avaliações só são permitidas após o serviço ser registrado como concluído.',
        });
      }

      if (appointment.review) {
        return res.status(400).json({ error: 'Este agendamento já possui uma avaliação registrada.' });
      }

      // Calculate 5-criteria average
      const averageScore = ReputationEngine.calculateReviewAverage({
        qualityRating: parseInt(qualityRating),
        punctualityRating: parseInt(punctualityRating),
        communicationRating: parseInt(communicationRating),
        careRating: parseInt(careRating),
        costBenefitRating: parseInt(costBenefitRating),
      });

      // Create verified review
      const review = await prisma.review.create({
        data: {
          appointmentId,
          clientId: client.id,
          providerId: appointment.providerId,
          qualityRating: parseInt(qualityRating),
          punctualityRating: parseInt(punctualityRating),
          communicationRating: parseInt(communicationRating),
          careRating: parseInt(careRating),
          costBenefitRating: parseInt(costBenefitRating),
          averageScore,
          comment,
          isVerified: true,
        },
      });

      // Update provider trust score using Bayesian Reputation Engine
      const providerReviews = await prisma.review.findMany({
        where: { providerId: appointment.providerId, status: 'PUBLISHED' },
        select: { averageScore: true },
      });

      const scores = providerReviews.map((r) => r.averageScore);
      const newTrustScore = ReputationEngine.calculateAdjustedTrustScore(scores.length, scores);

      await prisma.providerProfile.update({
        where: { id: appointment.providerId },
        data: {
          trustScore: newTrustScore,
          reviewCount: scores.length,
          isNewProvider: scores.length < 3, // Graduate from new provider status after 3 reviews
        },
      });

      return res.status(201).json({
        message: 'Avaliação verificada publicada com sucesso!',
        review,
        updatedProviderTrustScore: newTrustScore,
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao criar avaliação.', details: error.message });
    }
  }

  public static async getProviderReviews(req: Request, res: Response) {
    try {
      const { providerId } = req.params;

      const reviews = await prisma.review.findMany({
        where: { providerId, status: 'PUBLISHED' },
        include: { client: { select: { fullName: true, neighborhood: true } } },
        orderBy: { createdAt: 'desc' },
      });

      return res.json(reviews);
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao carregar avaliações.', details: error.message });
    }
  }
}
