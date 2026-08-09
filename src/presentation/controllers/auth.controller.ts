import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.service';
import { PasswordHasher } from '../../infrastructure/security/password.hasher';
import { JwtProvider } from '../../infrastructure/security/jwt.provider';
import { GeocodingService } from '../../infrastructure/geolocation/geocoding.service';

const normalizePhone = (value: unknown): string => String(value ?? '').replace(/\D/g, '');
const isValidMobilePhone = (value: string): boolean => /^[1-9]{2}9\d{8}$/.test(value);

export class AuthController {
  public static async registerClient(req: Request, res: Response) {
    try {
      const { email, phone: rawPhone, password, fullName, neighborhood, city, fullAddress } = req.body;
      const phone = normalizePhone(rawPhone);

      if (!email || !phone || !password || !fullName || !neighborhood || !city || !fullAddress) {
        return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
      }

      if (!isValidMobilePhone(phone)) {
        return res.status(400).json({ error: 'Informe um celular válido com DDD e 11 dígitos.' });
      }

      const existingUser = await prisma.user.findFirst({
        where: { OR: [{ email }, { phone }] },
      });

      if (existingUser) {
        return res.status(400).json({ error: 'E-mail ou telefone já cadastrados.' });
      }

      const passwordHash = await PasswordHasher.hash(password);

      const coords = await GeocodingService.getCoordinates(neighborhood, city);

      const user = await prisma.user.create({
        data: {
          email,
          phone,
          passwordHash,
          role: 'CLIENT',
          clientProfile: {
            create: {
              fullName,
              neighborhood,
              city,
              fullAddress,
              latitude: coords?.latitude,
              longitude: coords?.longitude,
            },
          },
        },
        include: { clientProfile: true },
      });

      const token = JwtProvider.generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return res.status(201).json({
        message: 'Cadastro de cliente realizado com sucesso!',
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          profile: user.clientProfile,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao cadastrar cliente.', details: error.message });
    }
  }

  public static async registerProvider(req: Request, res: Response) {
    try {
      const { email, phone: rawPhone, password, fullName, bio, serviceRadiusKm, city, neighborhood, categoryIds } = req.body;
      const phone = normalizePhone(rawPhone);

      if (!email || !phone || !password || !fullName || !city || !neighborhood) {
        return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
      }

      if (!isValidMobilePhone(phone)) {
        return res.status(400).json({ error: 'Informe um celular válido com DDD e 11 dígitos.' });
      }

      const existingUser = await prisma.user.findFirst({
        where: { OR: [{ email }, { phone }] },
      });

      if (existingUser) {
        return res.status(400).json({ error: 'E-mail ou telefone já cadastrados.' });
      }

      const passwordHash = await PasswordHasher.hash(password);

      const coords = await GeocodingService.getCoordinates(neighborhood, city);

      const user = await prisma.user.create({
        data: {
          email,
          phone,
          passwordHash,
          role: 'PROVIDER',
          providerProfile: {
            create: {
              fullName,
              bio: bio || 'Profissional de serviços domésticos',
              serviceRadiusKm: serviceRadiusKm ? parseFloat(serviceRadiusKm) : 10.0,
              isNewProvider: true,
              coverageAreas: {
                create: {
                  city,
                  neighborhood,
                  latitude: coords?.latitude,
                  longitude: coords?.longitude,
                },
              },
            },
          },
        },
        include: { providerProfile: true },
      });

      // Associate categories if provided
      if (categoryIds && Array.isArray(categoryIds)) {
        for (const catId of categoryIds) {
          await prisma.providerService.create({
            data: {
              providerId: user.providerProfile!.id,
              categoryId: catId,
              basePrice: 100.0,
            },
          });
        }
      }

      const token = JwtProvider.generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return res.status(201).json({
        message: 'Cadastro de profissional realizado com sucesso!',
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          profile: user.providerProfile,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao cadastrar profissional.', details: error.message });
    }
  }

  public static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Informe o e-mail e a senha.' });
      }

      const user = await prisma.user.findUnique({
        where: { email },
        include: { clientProfile: true, providerProfile: true },
      });

      if (!user) {
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      const validPassword = await PasswordHasher.compare(password, user.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      const token = JwtProvider.generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          profile: user.role === 'CLIENT' ? user.clientProfile : user.providerProfile,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro no login.', details: error.message });
    }
  }

  public static async getCurrentUser(req: any, res: Response) {
    try {
      const userId = req.user.userId;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          clientProfile: true,
          providerProfile: {
            include: {
              services: { include: { category: true } },
              coverageAreas: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }

      const { passwordHash, ...userWithoutPassword } = user;
      return res.json(userWithoutPassword);
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao buscar usuário.', details: error.message });
    }
  }
}
