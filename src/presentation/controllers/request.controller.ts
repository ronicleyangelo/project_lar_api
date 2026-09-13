import { Request, Response } from 'express';
import { createHash } from 'crypto';
import { prisma } from '../../infrastructure/database/prisma.service';
import { RecommendationEngine } from '../../infrastructure/ranking/recommendation.engine';
import { PrivacyService } from '../middlewares/privacy.middleware';
import { GeocodingService } from '../../infrastructure/geolocation/geocoding.service';
import { providerCoversRequest } from '../../domain/provider-coverage.policy';

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
    ...(Array.isArray(payload.activityIds) ? [...payload.activityIds].sort() : []),
    normalizeFingerprintText(payload.description),
  ].join('|');

  return createHash('sha256').update(fingerprint).digest('hex');
}

export class RequestController {
  public static async createRequest(req: any, res: Response) {
    let deduplicationKey: string | undefined;

    try {
      const userId = req.user.userId;
      const { categoryId, city, neighborhood, scheduledDate, timeSlot, budgetLimit, description, activityIds } = req.body;
      const normalizedCity = normalizeText(city);
      const normalizedNeighborhood = normalizeText(neighborhood);
      const normalizedTimeSlot = normalizeText(timeSlot);
      const normalizedDescription = normalizeText(description);
      const parsedDate = new Date(scheduledDate);
      const parsedBudget = budgetLimit === undefined || budgetLimit === null || budgetLimit === ''
        ? null
        : Number(budgetLimit);
      const selectedActivityIds = Array.isArray(activityIds) ? Array.from(new Set(activityIds.map(String))) : [];

      if (!categoryId || !normalizedCity || !normalizedNeighborhood || !scheduledDate || !normalizedTimeSlot || !normalizedDescription) {
        return res.status(400).json({ error: 'Preencha todos os campos da solicitação.' });
      }
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'Informe uma data válida para o serviço.' });
      }
      const todayInSaoPaulo = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(scheduledDate)) || String(scheduledDate) < todayInSaoPaulo) {
        return res.status(400).json({ error: 'A data do serviço não pode estar no passado.' });
      }
      if (parsedBudget !== null && (!Number.isFinite(parsedBudget) || parsedBudget <= 0 || parsedBudget > 1_000_000)) {
        return res.status(400).json({ error: 'O orçamento deve ser maior que zero e válido.' });
      }
      if (normalizedDescription.length < 10 || normalizedDescription.length > 1000) {
        return res.status(400).json({ error: 'A descrição deve ter entre 10 e 1000 caracteres.' });
      }
      if (selectedActivityIds.length === 0) {
        return res.status(400).json({ error: 'Selecione ao menos uma atividade para o serviço.' });
      }

      const [clientProfile, category, validActivityCount] = await Promise.all([
        prisma.clientProfile.findUnique({ where: { userId } }),
        prisma.category.findUnique({ where: { id: categoryId } }),
        prisma.serviceActivity.count({ where: { id: { in: selectedActivityIds }, active: true } }),
      ]);

      if (!clientProfile) {
        return res.status(400).json({ error: 'Perfil de cliente não encontrado.' });
      }
      if (!category) {
        return res.status(400).json({ error: 'Categoria de serviço não encontrada.' });
      }
      if (validActivityCount !== selectedActivityIds.length) {
        return res.status(400).json({ error: 'Uma ou mais atividades selecionadas são inválidas.' });
      }

      deduplicationKey = buildDeduplicationKey(clientProfile.id, {
        categoryId,
        city: normalizedCity,
        neighborhood: normalizedNeighborhood,
        scheduledDate: parsedDate.toISOString(),
        timeSlot: normalizedTimeSlot,
        budgetLimit: parsedBudget,
        description: normalizedDescription,
        activityIds: selectedActivityIds,
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
        ? { latitude: Number(clientProfile.latitude), longitude: Number(clientProfile.longitude) }
        : await GeocodingService.getCoordinates(normalizedNeighborhood, normalizedCity);

      const serviceRequest = await prisma.serviceRequest.create({
        data: {
          deduplicationKey,
          clientId: clientProfile.id,
          categoryId,
          city: normalizedCity,
          neighborhood: normalizedNeighborhood,
          latitude: coordinates?.latitude ? String(coordinates.latitude) : (clientProfile.latitude ? String(clientProfile.latitude) : undefined),
          longitude: coordinates?.longitude ? String(coordinates.longitude) : (clientProfile.longitude ? String(clientProfile.longitude) : undefined),
          approximateLat: coordinates?.latitude ? Math.floor(coordinates.latitude * 100) / 100 : (clientProfile.approximateLat ?? undefined),
          approximateLng: coordinates?.longitude ? Math.floor(coordinates.longitude * 100) / 100 : (clientProfile.approximateLng ?? undefined),
          approxDistanceKm: 2.5,
          scheduledDate: parsedDate,
          timeSlot: normalizedTimeSlot,
          budgetLimit: parsedBudget,
          description: normalizedDescription,
          activities: { create: selectedActivityIds.map(activityId => ({ activityId })) },
        },
        include: { category: true, client: true, activities: { include: { activity: true } } },
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
      console.error('Erro ao criar solicitação:', error);
      return res.status(500).json({ error: 'Erro ao criar solicitação.' });
    }
  }

  public static async getRecommendations(req: Request, res: Response) {
    try {
      const { categoryId, city, neighborhood, minBudget, maxBudget, propertyType, hasPets, minRating, activityIds } = req.query;
      if (!categoryId) {
        return res.status(400).json({ error: 'Informe a categoria para recomendação.' });
      }

      const allProviders = await prisma.providerProfile.findMany({
        where: {
          services: { some: { categoryId: categoryId as string } },
          user: { profileVisible: true, status: 'ACTIVE' },
          verificationStatus: 'VERIFIED',
        },
        include: { services: true, coverageAreas: true, activities: true },
      });
      const rankedProviders = await RecommendationEngine.rankProviders(allProviders, {
        categoryId: categoryId as string,
        city: String(city || ''),
        neighborhood: String(neighborhood || ''),
        minBudget: minBudget ? Number(minBudget) : undefined,
        maxBudget: maxBudget ? Number(maxBudget) : undefined,
        propertyType: propertyType ? String(propertyType) : undefined,
        hasPets: hasPets === 'true',
        minRating: minRating ? Number(minRating) : undefined,
        activityIds: typeof activityIds === 'string' ? activityIds.split(',').filter(Boolean) : undefined,
      });
      return res.json(rankedProviders);
    } catch (error: any) {
      console.error('Erro ao gerar recomendações:', error);
      return res.status(500).json({ error: 'Erro ao gerar recomendações.' });
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
          activities: { include: { activity: true } },
          quotes: { include: { provider: true } },
          appointments: { include: { provider: true, review: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return res.json(requests);
    } catch (error: any) {
      console.error('Erro ao listar solicitações:', error);
      return res.status(500).json({ error: 'Erro ao listar solicitações.' });
    }
  }

  public static async listOpenRequestsForProvider(req: any, res: Response) {
    try {
      const provider = await prisma.providerProfile.findUnique({
        where: { userId: req.user.userId },
        include: { services: true, coverageAreas: true, activities: true },
      });
      if (!provider) {
        return res.status(400).json({ error: 'Perfil de profissional não encontrado.' });
      }
      if (provider.verificationStatus !== 'VERIFIED') {
        return res.status(403).json({ error: 'Seu perfil precisa ser aprovado antes de receber pedidos.' });
      }

      const requests = await prisma.serviceRequest.findMany({
        where: {
          categoryId: { in: provider.services.map((service) => service.categoryId) },
          status: { in: ['OPEN', 'QUOTED'] },
          quotes: { none: { providerId: provider.id } },
        },
        include: { category: true, client: true, activities: { include: { activity: true } } },
        orderBy: { createdAt: 'desc' },
      });

      const visibleRequests = requests.filter((requestItem) => {
        return providerCoversRequest(provider.serviceRadiusKm, provider.coverageAreas, requestItem);
      });

      return res.json(visibleRequests.map((requestItem) => PrivacyService.maskClientAddress(requestItem, false)));
    } catch (error: any) {
      console.error('Erro ao listar solicitações abertas:', error);
      return res.status(500).json({ error: 'Erro ao listar solicitações abertas.' });
    }
  }
}
