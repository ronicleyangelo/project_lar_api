import { Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.service';
import { GeocodingService } from '../../infrastructure/geolocation/geocoding.service';
import { GeospatialFuzzingUtil } from '../../infrastructure/security/geospatial-fuzzing.util';

const normalizePhone = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export class ClientProfileController {
  static async getProfile(req: any, res: Response) {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { clientProfile: true },
    });
    if (!user?.clientProfile) return res.status(404).json({ error: 'Perfil de cliente não encontrado.' });
    return res.json({ email: user.email, phone: user.phone, avatarUrl: user.avatarUrl, ...user.clientProfile });
  }

  static async updateProfile(req: any, res: Response) {
    const { fullName, city, neighborhood, fullAddress } = req.body;
    const phone = normalizePhone(req.body.phone);
    if (!String(fullName || '').trim() || !String(city || '').trim() || !String(neighborhood || '').trim() || !String(fullAddress || '').trim()) {
      return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
    }
    if (!/^[1-9]{2}9\d{8}$/.test(phone)) return res.status(400).json({ error: 'Informe um celular válido com DDD.' });

    const profile = await prisma.clientProfile.findUnique({ where: { userId: req.user.userId } });
    if (!profile) return res.status(404).json({ error: 'Perfil de cliente não encontrado.' });
    const phoneOwner = await prisma.user.findFirst({ where: { phone, id: { not: req.user.userId } } });
    if (phoneOwner) return res.status(409).json({ error: 'Este telefone já está cadastrado.' });
    const coordinates = await GeocodingService.getCoordinates(neighborhood, city);
    const updated = await prisma.$transaction(async tx => {
      await tx.user.update({ where: { id: req.user.userId }, data: { phone } });
      return tx.clientProfile.update({ where: { id: profile.id }, data: {
        fullName: String(fullName).trim(), city: String(city).trim(), neighborhood: String(neighborhood).trim(), fullAddress: String(fullAddress).trim(),
        latitude: coordinates ? String(coordinates.latitude) : profile.latitude,
        longitude: coordinates ? String(coordinates.longitude) : profile.longitude,
        approximateLat: coordinates ? GeospatialFuzzingUtil.fuzzCoordinate(coordinates.latitude) : profile.approximateLat,
        approximateLng: coordinates ? GeospatialFuzzingUtil.fuzzCoordinate(coordinates.longitude) : profile.approximateLng,
      } });
    });
    return res.json({ message: 'Perfil atualizado com sucesso.', profile: { ...updated, phone } });
  }
}
