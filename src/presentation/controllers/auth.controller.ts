import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.service';
import { PasswordHasher } from '../../infrastructure/security/password.hasher';
import { JwtProvider } from '../../infrastructure/security/jwt.provider';
import { GeocodingService } from '../../infrastructure/geolocation/geocoding.service';
import { GoogleAuthProvider } from '../../infrastructure/security/google-auth.provider';
import { SERVICE_CATEGORIES } from '../../domain/constants/service-categories';
import { setTokenCookie, clearTokenCookie } from '../../shared/http/cookie.helper';

const normalizePhone = (value: unknown): string => String(value ?? '').replace(/\D/g, '');
const isValidMobilePhone = (value: string): boolean => /^[1-9]{2}9\d{8}$/.test(value);

export class AuthController {
  private static toAuthResponse(user: any) {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
      profile: user.role === 'CLIENT' ? user.clientProfile : user.providerProfile,
    };
  }

  public static async googleLogin(req: Request, res: Response) {
    try {
      const credential = String(req.body?.credential || '');
      if (!credential) {
        return res.status(400).json({ error: 'Credencial do Google não fornecida.' });
      }

      const identity = await GoogleAuthProvider.verifyIdToken(credential);
      let user = await prisma.user.findFirst({
        where: { OR: [{ googleId: identity.googleId }, { email: identity.email }] },
        include: { clientProfile: true, providerProfile: true },
      });

      if (user) {
        if (user.status === 'SUSPENDED') {
          return res.status(403).json({ error: 'Esta conta está suspensa.' });
        }
        if (user.googleId && user.googleId !== identity.googleId) {
          return res.status(409).json({ error: 'Este e-mail já está vinculado a outra conta Google.' });
        }

        const hasCompleteProfile =
          (user.role === 'CLIENT' && !!user.clientProfile) ||
          (user.role === 'PROVIDER' && !!user.providerProfile) ||
          user.role === 'ADMIN';

        if (!hasCompleteProfile) {
          const onboardingToken = JwtProvider.generateGoogleOnboardingToken({
            ...identity,
            existingUserId: user.id,
          });
          return res.json({
            requiresOnboarding: true,
            onboardingToken,
            googleProfile: { email: identity.email, fullName: identity.fullName, picture: identity.picture },
          });
        }

        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: identity.googleId,
            emailVerified: true,
            avatarUrl: identity.picture || (user as any).avatarUrl,
          } as any,
          include: { clientProfile: true, providerProfile: true },
        });

        const token = JwtProvider.generateToken({ userId: user.id, email: user.email, role: user.role });
        setTokenCookie(res, token);
        return res.json({ token, user: AuthController.toAuthResponse(user), requiresOnboarding: false });
      }

      const onboardingToken = JwtProvider.generateGoogleOnboardingToken(identity);
      return res.json({
        requiresOnboarding: true,
        onboardingToken,
        googleProfile: { email: identity.email, fullName: identity.fullName, picture: identity.picture },
      });
    } catch (error: any) {
      const configurationError = String(error.message).includes('GOOGLE_CLIENT_ID');
      return res.status(configurationError ? 503 : 401).json({
        error: configurationError ? error.message : 'Não foi possível validar a conta Google.',
      });
    }
  }

  public static async completeGoogleRegistration(req: Request, res: Response) {
    try {
      const {
        onboardingToken, role, phone: rawPhone, fullName: providedName, neighborhood, city,
        fullAddress, bio, serviceRadiusKm, propertyTypes, acceptsPets,
      } = req.body;
      const phone = normalizePhone(rawPhone);

      if (!onboardingToken || !['CLIENT', 'PROVIDER'].includes(role)) {
        return res.status(400).json({ error: 'Dados de conclusão do cadastro inválidos.' });
      }
      if (!isValidMobilePhone(phone)) {
        return res.status(400).json({ error: 'Informe um celular válido com DDD e 11 dígitos.' });
      }
      if (!neighborhood || !city || (role === 'CLIENT' && !fullAddress)) {
        return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
      }

      const identity = JwtProvider.verifyGoogleOnboardingToken(onboardingToken);
      const fullName = String(providedName || identity.fullName).trim();
      if (!fullName) {
        return res.status(400).json({ error: 'Informe seu nome completo.' });
      }

      const existing = await prisma.user.findFirst({
        where: {
          OR: [{ email: identity.email }, { phone }, { googleId: identity.googleId }],
          ...(identity.existingUserId ? { NOT: { id: identity.existingUserId } } : {}),
        },
      });
      if (existing) {
        return res.status(409).json({ error: 'E-mail, telefone ou conta Google já cadastrados. Faça login novamente.' });
      }

      const coords = await GeocodingService.getCoordinates(neighborhood, city);
      const user = await prisma.$transaction(async tx => {
        const userData: any = {
            email: identity.email,
            phone,
            passwordHash: null,
            googleId: identity.googleId,
            avatarUrl: identity.picture || null,
            emailVerified: true,
            role,
            status: 'ACTIVE',
            ...(role === 'CLIENT' ? {
              clientProfile: { create: { fullName, neighborhood, city, fullAddress, latitude: coords?.latitude, longitude: coords?.longitude } },
            } : {
              providerProfile: { create: {
                fullName,
                bio: bio || 'Profissional de serviços domésticos',
                photoUrl: identity.picture,
                serviceRadiusKm: serviceRadiusKm ? Number(serviceRadiusKm) : 10,
                propertyTypes: Array.isArray(propertyTypes) ? propertyTypes : [],
                acceptsPets: acceptsPets !== false,
                isNewProvider: true,
                coverageAreas: { create: { city, neighborhood, latitude: coords?.latitude, longitude: coords?.longitude } },
              } },
            }),
        };

        const created = identity.existingUserId
          ? await tx.user.update({
              where: { id: identity.existingUserId },
              data: userData,
              include: { clientProfile: true, providerProfile: true },
            })
          : await tx.user.create({
              data: userData,
              include: { clientProfile: true, providerProfile: true },
            });

        if (role === 'PROVIDER') {
          const cleaningCategory = await tx.category.upsert({
            where: { name: SERVICE_CATEGORIES[0].name },
            update: SERVICE_CATEGORIES[0],
            create: SERVICE_CATEGORIES[0],
          });
          await tx.providerService.create({
            data: { providerId: created.providerProfile!.id, categoryId: cleaningCategory.id, basePrice: 25 },
          });
        }
        return created;
      });

      const token = JwtProvider.generateToken({ userId: user.id, email: user.email, role: user.role });
      setTokenCookie(res, token);
      return res.status(201).json({ token, user: AuthController.toAuthResponse(user), requiresOnboarding: false });
    } catch (error: any) {
      if (error?.name === 'TokenExpiredError' || error?.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Sua sessão de cadastro expirou. Entre com o Google novamente.' });
      }
      return res.status(500).json({ error: 'Erro ao concluir o cadastro com Google.', details: error.message });
    }
  }

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
      setTokenCookie(res, token);

      return res.status(201).json({
        message: 'Cadastro de cliente realizado com sucesso!',
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          profile: user.clientProfile,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao cadastrar cliente.', details: error.message });
    }
  }

  public static async registerProvider(req: Request, res: Response) {
    try {
      const { email, phone: rawPhone, password, fullName, bio, serviceRadiusKm, city, neighborhood, propertyTypes, acceptsPets } = req.body;
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
              propertyTypes: Array.isArray(propertyTypes) ? propertyTypes : [],
              acceptsPets: acceptsPets !== false,
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

      const cleaningCategory = await prisma.category.upsert({
        where: { name: SERVICE_CATEGORIES[0].name },
        update: SERVICE_CATEGORIES[0],
        create: SERVICE_CATEGORIES[0],
      });
      await prisma.providerService.create({
        data: { providerId: user.providerProfile!.id, categoryId: cleaningCategory.id, basePrice: 25 },
      });

      const token = JwtProvider.generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });
      setTokenCookie(res, token);

      return res.status(201).json({
        message: 'Cadastro de profissional realizado com sucesso!',
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
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

      if (!user.passwordHash) {
        return res.status(401).json({ error: 'Esta conta utiliza login com Google.' });
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
      setTokenCookie(res, token);

      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
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

  public static async logout(_req: Request, res: Response) {
    clearTokenCookie(res);
    return res.json({ message: 'Logout realizado com sucesso.' });
  }
}
