import { Request, Response } from 'express';
import { createHash } from 'crypto';
import { prisma } from '../../infrastructure/database/prisma.service';
import { RecommendationEngine } from '../../infrastructure/ranking/recommendation.engine';
import { PrivacyService } from '../middlewares/privacy.middleware';
import { GeocodingService } from '../../infrastructure/geolocation/geocoding.service';

const normalizeText = (value: unknown): string => String(value ?? '').trim().replace(/\s+/g, ' ');
const normalizeFingerprintText = (value: unknown): string => normalizeText(value).toLocaleLowerCase('pt-BR');

function buildDeduplicationKey(clientId: string, payload: Record<string, unknown>): string {
  const fingerprint = [
    clientId,
    payload.categoryId,
    normalizeFingerprintText(payload.city),
    normalizeFingerprintText(payload.neighborhood),
    payload.scheduledDate,
    normalizeFingerprintText(payload.timeSlot),
    payload.budgetLimit ?? '',
    normalizeFingerprintText(payload.description),
  ].join('|');

  return createHash('sha256').update(fingerprint).digest('hex');
}

export class RequestController {
  public static async createRequest(req: any, res: Response) {
    let deduplicationKey: string | undefined;

    try {
      const userId = req.user.userId;
      const { categoryId, city, neighborhood, scheduledDate, timeSlot, budgetLimit, description } = req.body;
      const normalizedCity = normalizeText(city);
      const normalizedNeighborhood = normalizeText(neighborhood);
      const normalizedTimeSlot = normalizeText(timeSlot);
      const normalizedDescription = normalizeText(description);
      const parsedDate = new Date(scheduledDate);
      const parsedBudget = budgetLimit === undefined || budgetLimit === null || budgetLimit === ''
        ? null
        : Number(budgetLimit);

      if (!categoryId || !normalizedCity || !normalizedNeighborhood || !scheduledDate || !normalizedTimeSlot || !normalizedDescription) {
        return res.status(400).json({ error: 'Preencha todos os campos da solicitação.' });
      }
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'Informe uma data válida para o serviço.' });
      }
      if (parsedBudget !== null && (!Number.isFinite(parsedBudget) || parsedBudget < 0)) {
        return res.status(400).json({ error: 'O orçamento deve ser um valor válido.' });
      }

      const [clientProfile, category] = await Promise.all([
        prisma.clientProfile.findUnique({ where: { userId } }),
        prisma.category.findUnique({ where: { id: categoryId } }),
      ]);

      if (!clientProfile) {
        return res.status(400).json({ error: 'Perfil de cliente não encontrado.' });
      }
      if (!category) {
        return res.status(400).json({ error: 'Categoria de serviço não encontrada.' });
      }

      deduplicationKey = buildDeduplicationKey(clientProfile.id, {
        categoryId,
        city: normalizedCity,
        neighborhood: normalizedNeighborhood,
        scheduledDate: parsedDate.toISOString(),
        timeSlot: normalizedTimeSlot,
        budgetLimit: parsedBudget,
        description: normalizedDescription,
      });

      const existingRequest = await prisma.serviceRequest.findUnique({
        where: { deduplicationKey },
        include: { category: true, client: true },
      });
      if (existingRequest) {
        return res.status(200).json({
          message: 'Este pedido já havia sido publicado.',
          serviceRequest: existingRequest,
          deduplicated: true,
        });
      }

      const isProfileLocation =
        normalizeFingerprintText(clientProfile.city) === normalizeFingerprintText(normalizedCity) &&
        normalizeFingerprintText(clientProfile.neighborhood) === normalizeFingerprintText(normalizedNeighborhood);
      const coordinates = isProfileLocation && clientProfile.latitude != null && clientProfile.longitude != null
        ? { latitude: clientProfile.latitude, longitude: clientProfile.longitude }
        : await GeocodingService.getCoordinates(normalizedNeighborhood, normalizedCity);

      const serviceRequest = await prisma.serviceRequest.create({
        data: {
          deduplicationKey,
          clientId: clientProfile.id,
          categoryId,
          city: normalizedCity,
          neighborhood: normalizedNeighborhood,
          latitude: coordinates?.latitude ?? clientProfile.latitude,
          longitude: coordinates?.longitude ?? clientProfile.longitude,
          approxDistanceKm: 2.5,
          scheduledDate: parsedDate,
          timeSlot: normalizedTimeSlot,
          budgetLimit: parsedBudget,
          description: normalizedDescription,
        },
        include: { category: true, client: true },
      });

      return res.status(201).json({
        message: 'Solicitação de serviço publicada com sucesso!',
        serviceRequest,
        deduplicated: false,
      });
    } catch (error: any) {
      if (error.code === 'P2002' && deduplicationKey) {
        const existingRequest = await prisma.serviceRequest.findUnique({
          where: { deduplicationKey },
          include: { category: true, client: true },
        });
        if (existingRequest) {
          return res.status(200).json({
            message: 'Este pedido já havia sido publicado.',
            serviceRequest: existingRequest,
            deduplicated: true,
          });
        }
      }
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
        where: {
          services: { some: { categoryId: categoryId as string } },
        },
        include: { services: true, coverageAreas: true },
      });
      const rankedProviders = await RecommendationEngine.rankProviders(allProviders, {
        categoryId: categoryId as string,
        city: city as string,
        neighborhood: neighborhood as string,
        minBudget: minBudget ? Number(minBudget) : undefined,
        maxBudget: maxBudget ? Number(maxBudget) : undefined,
      });
      return res.json(rankedProviders);
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao gerar recomendações.', details: error.message });
    }
  }

  public static async listClientRequests(req: any, res: Response) {
    try {
      const clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.userId } });
      if (!clientProfile) {
        return res.status(400).json({ error: 'Perfil de cliente não encontrado.' });
      }

      const requests = await prisma.serviceRequest.findMany({
        where: { clientId: clientProfile.id },
        include: {
          category: true,
          quotes: { include: { provider: true } },
          appointments: { include: { provider: true, review: true } },
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
      const provider = await prisma.providerProfile.findUnique({
        where: { userId: req.user.userId },
        include: { services: true, coverageAreas: true },
      });
      if (!provider) {
        return res.status(400).json({ error: 'Perfil de profissional não encontrado.' });
      }

      const requests = await prisma.serviceRequest.findMany({
        where: {
          categoryId: { in: provider.services.map((service) => service.categoryId) },
          status: { in: ['OPEN', 'QUOTED'] },
          quotes: { none: { providerId: provider.id } },
        },
        include: { category: true, client: true },
        orderBy: { createdAt: 'desc' },
      });

      const visibleRequests = requests.filter((requestItem) => {
        if (requestItem.latitude == null || requestItem.longitude == null) return true;
        return provider.coverageAreas.some((area) => {
          if (area.latitude == null || area.longitude == null) return false;
          return GeocodingService.calculateDistance(
            requestItem.latitude!, requestItem.longitude!, area.latitude, area.longitude
          ) <= provider.serviceRadiusKm;
        });
      });

      return res.json(visibleRequests.map((requestItem) => PrivacyService.maskClientAddress(requestItem, false)));
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao listar solicitações abertas.', details: error.message });
    }
  }
}
