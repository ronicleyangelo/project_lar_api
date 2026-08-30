import { Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.service';
import { GeocodingService } from '../../infrastructure/geolocation/geocoding.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

const normalizePhone = (value: unknown): string => String(value ?? '').replace(/\D/g, '');
const isValidMobilePhone = (value: string): boolean => /^[1-9]{2}9\d{8}$/.test(value);
const allowedPropertyTypes = new Set(['HOUSE', 'APARTMENT', 'CONDOMINIUM']);

export class ProviderProfileController {
  public static async getProfile(req: AuthenticatedRequest, res: Response) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          email: true,
          phone: true,
          providerProfile: {
            include: {
              coverageAreas: true,
              services: { include: { category: true } },
              activities: true,
            },
          },
        },
      });
      if (!user?.providerProfile) {
        return res.status(404).json({ error: 'Perfil profissional não encontrado.' });
      }
      const primaryArea = user.providerProfile.coverageAreas[0];
      const cleaningService = user.providerProfile.services[0];
      return res.json({
        id: user.providerProfile.id,
        email: user.email,
        phone: user.phone,
        fullName: user.providerProfile.fullName,
        bio: user.providerProfile.bio || '',
        photoUrl: user.providerProfile.photoUrl,
        city: primaryArea?.city || '',
        neighborhood: primaryArea?.neighborhood || '',
        serviceRadiusKm: user.providerProfile.serviceRadiusKm,
        propertyTypes: user.providerProfile.propertyTypes,
        acceptsPets: user.providerProfile.acceptsPets,
        basePrice: cleaningService?.basePrice || 25,
        activityIds: user.providerProfile.activities.map(item => item.activityId),
        isVerified: user.providerProfile.isVerified,
        verificationStatus: user.providerProfile.verificationStatus,
        verificationNote: user.providerProfile.verificationNote,
        submittedForReviewAt: user.providerProfile.submittedForReviewAt,
        trustScore: user.providerProfile.trustScore,
        reviewCount: user.providerProfile.reviewCount,
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao carregar o perfil profissional.', details: error.message });
    }
  }

  public static async updateProfile(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { fullName, bio, photoUrl, city, neighborhood, serviceRadiusKm, propertyTypes, acceptsPets, basePrice, activityIds } = req.body;
      const phone = normalizePhone(req.body.phone);
      const radius = Number(serviceRadiusKm);
      const price = Number(basePrice);
      const selectedPropertyTypes = Array.isArray(propertyTypes)
        ? propertyTypes.filter((value: string) => allowedPropertyTypes.has(value))
        : [];
      const selectedActivityIds = Array.isArray(activityIds) ? Array.from(new Set(activityIds.map(String))) : [];

      if (!String(fullName || '').trim() || !String(city || '').trim() || !String(neighborhood || '').trim()) {
        return res.status(400).json({ error: 'Nome, bairro e cidade são obrigatórios.' });
      }
      if (!isValidMobilePhone(phone)) {
        return res.status(400).json({ error: 'Informe um celular válido com DDD e 11 dígitos.' });
      }
      if (!Number.isFinite(radius) || radius < 1 || radius > 100) {
        return res.status(400).json({ error: 'O raio deve estar entre 1 e 100 km.' });
      }
      if (!Number.isFinite(price) || price < 25) {
        return res.status(400).json({ error: 'O valor por hora deve ser de no mínimo R$ 25.' });
      }
      if (selectedPropertyTypes.length === 0) {
        return res.status(400).json({ error: 'Selecione ao menos um tipo de imóvel.' });
      }
      if (selectedActivityIds.length === 0) {
        return res.status(400).json({ error: 'Selecione ao menos uma atividade que você realiza.' });
      }
      const validActivityCount = await prisma.serviceActivity.count({ where: { id: { in: selectedActivityIds }, active: true } });
      if (validActivityCount !== selectedActivityIds.length) {
        return res.status(400).json({ error: 'Uma ou mais atividades selecionadas são inválidas.' });
      }

      const phoneOwner = await prisma.user.findFirst({ where: { phone, NOT: { id: userId } } });
      if (phoneOwner) {
        return res.status(409).json({ error: 'Este telefone já está cadastrado em outra conta.' });
      }
      const current = await prisma.user.findUnique({
        where: { id: userId },
        include: { providerProfile: { include: { services: true } } },
      });
      if (!current?.providerProfile) {
        return res.status(404).json({ error: 'Perfil profissional não encontrado.' });
      }

      const coords = await GeocodingService.getCoordinates(neighborhood, city);
      await prisma.$transaction(async tx => {
        await tx.user.update({ where: { id: userId }, data: { phone } });
        await tx.providerProfile.update({
          where: { id: current.providerProfile!.id },
          data: {
            fullName: String(fullName).trim(),
            bio: String(bio || '').trim() || null,
            photoUrl: String(photoUrl || '').trim() || null,
            serviceRadiusKm: radius,
            propertyTypes: selectedPropertyTypes,
            acceptsPets: acceptsPets !== false,
            coverageAreas: {
              deleteMany: {},
              create: { city: String(city).trim(), neighborhood: String(neighborhood).trim(), latitude: coords?.latitude, longitude: coords?.longitude },
            },
          },
        });
        await tx.providerActivity.deleteMany({ where: { providerId: current.providerProfile!.id } });
        await tx.providerActivity.createMany({
          data: selectedActivityIds.map(activityId => ({ providerId: current.providerProfile!.id, activityId })),
          skipDuplicates: true,
        });
        if (current.providerProfile!.services[0]) {
          await tx.providerService.update({
            where: { id: current.providerProfile!.services[0].id },
            data: { basePrice: price },
          });
        }
      });
      return ProviderProfileController.getProfile(req, res);
    } catch (error: any) {
      console.error('[ProviderProfile] Falha ao atualizar perfil:', error);
      return res.status(500).json({ error: 'Erro ao atualizar o perfil profissional.', details: error.message });
    }
  }

  public static async submitForReview(req: AuthenticatedRequest, res: Response) {
    try {
      const profile = await prisma.providerProfile.findUnique({
        where: { userId: req.user!.userId },
        include: { services: true, coverageAreas: true, activities: true },
      });
      if (!profile) return res.status(404).json({ error: 'Perfil profissional não encontrado.' });
      if (!profile.fullName.trim() || !profile.coverageAreas.length || !profile.services.length || !profile.propertyTypes.length || !profile.activities.length) {
        return res.status(400).json({ error: 'Complete localização, preço, imóveis atendidos e atividades antes de enviar para análise.' });
      }
      if (profile.verificationStatus === 'PENDING_REVIEW') return res.status(409).json({ error: 'Seu perfil já está aguardando análise.' });
      if (profile.verificationStatus === 'VERIFIED') return res.status(409).json({ error: 'Seu perfil já está verificado.' });

      await prisma.providerProfile.update({
        where: { id: profile.id },
        data: { verificationStatus: 'PENDING_REVIEW', verificationNote: null, submittedForReviewAt: new Date() },
      });
      return res.json({ message: 'Perfil enviado para análise. Você será avisado quando a equipe concluir.' });
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao enviar o perfil para análise.', details: error.message });
    }
  }
}
