import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.service';
import { RecommendationEngine } from '../../infrastructure/ranking/recommendation.engine';
import { PrivacyService } from '../middlewares/privacy.middleware';
import { GeocodingService } from '../../infrastructure/geolocation/geocoding.service';

export class RequestController {
  public static async createRequest(req: any, res: Response) {
    try {
      const userId = req.user.userId;
      const { categoryId, city, neighborhood, scheduledDate, timeSlot, budgetLimit, description } = req.body;

      if (!categoryId || !city || !neighborhood || !scheduledDate || !timeSlot || !description) {
        return res.status(400).json({ error: 'Preencha todos os campos da solicitação.' });
      }

      const clientProfile = await prisma.clientProfile.findUnique({
        where: { userId },
      });

      if (!clientProfile) {
        return res.status(400).json({ error: 'Perfil de cliente não encontrado.' });
      }

      const coords = await GeocodingService.getCoordinates(neighborhood, city);

      const serviceRequest = await prisma.serviceRequest.create({
        data: {
          clientId: clientProfile.id,
          categoryId,
          city,
          neighborhood,
          latitude: coords?.latitude || clientProfile.latitude,
          longitude: coords?.longitude || clientProfile.longitude,
          approxDistanceKm: 2.5,
          scheduledDate: new Date(scheduledDate),
          timeSlot,
          budgetLimit: budgetLimit ? parseFloat(budgetLimit) : null,
          description,
        },
        include: {
          category: true,
          client: true,
        },
      });

      return res.status(201).json({
        message: 'Solicitação de serviço publicada com sucesso!',
        serviceRequest,
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao criar solicitação.', details: error.message });
    }
  }

  public static async getRecommendations(req: Request, res: Response) {
    try {
      const { categoryId, city, neighborhood, minBudget, maxBudget } = req.query;

      if (!categoryId || !city || !neighborhood) {
        return res.status(400).json({ error: 'Informe categoria, cidade e bairro para recomendação.' });
      }

      const allProviders = await prisma.providerProfile.findMany({
        include: {
          services: true,
          coverageAreas: true,
        },
      });

      const rankedProviders = await RecommendationEngine.rankProviders(allProviders, {
        categoryId: categoryId as string,
        city: city as string,
        neighborhood: neighborhood as string,
        minBudget: minBudget ? parseFloat(minBudget as string) : undefined,
        maxBudget: maxBudget ? parseFloat(maxBudget as string) : undefined,
      });

      return res.json(rankedProviders);
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao gerar recomendações.', details: error.message });
    }
  }

  public static async listClientRequests(req: any, res: Response) {
    try {
      const userId = req.user.userId;
      const clientProfile = await prisma.clientProfile.findUnique({ where: { userId } });

      if (!clientProfile) {
        return res.status(400).json({ error: 'Perfil de cliente não encontrado.' });
      }

      const requests = await prisma.serviceRequest.findMany({
        where: { clientId: clientProfile.id },
        include: {
          category: true,
          quotes: {
            include: {
              provider: true,
            },
          },
          appointments: {
            include: {
              provider: true,
              review: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json(requests);
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao listar solicitações.', details: error.message });
    }
  }

  public static async listOpenRequestsForProvider(req: any, res: Response) {
    try {
      const userId = req.user.userId;
      const provider = await prisma.providerProfile.findUnique({
        where: { userId },
        include: { services: true, coverageAreas: true },
      });

      if (!provider) {
        return res.status(400).json({ error: 'Perfil de profissional não encontrado.' });
      }

      const categoryIds = provider.services.map((s) => s.categoryId);

      const requests = await prisma.serviceRequest.findMany({
        where: {
          categoryId: { in: categoryIds },
          status: { in: ['OPEN', 'QUOTED'] },
          quotes: { none: { providerId: provider.id } },
        },
        include: {
          category: true,
          client: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Filter by Physical Distance using Provider's Coverage Areas
      const filteredRequests = requests.filter((reqItem) => {
        if (!reqItem.latitude || !reqItem.longitude) return true; // If no coords, show to all as fallback

        let isWithinRadius = false;
        for (const area of provider.coverageAreas) {
          if (area.latitude && area.longitude) {
            const distance = GeocodingService.calculateDistance(
              reqItem.latitude, reqItem.longitude,
              area.latitude, area.longitude
            );
            
            // Check if distance is within the provider's max service radius
            if (distance <= provider.serviceRadiusKm) {
              isWithinRadius = true;
              break;
            }
          }
        }
        return isWithinRadius;
      });

      // Apply Privacy Masking on Client Address!
      const maskedRequests = filteredRequests.map((reqItem) =>
        PrivacyService.maskClientAddress(reqItem, false)
      );

      return res.json(maskedRequests);
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao listar solicitações abertas.', details: error.message });
    }
  }
}
