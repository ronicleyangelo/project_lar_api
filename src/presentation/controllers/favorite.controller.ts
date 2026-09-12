import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export class FavoriteController {
  static async list(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
      const rows = await prisma.$queryRaw<Array<{ providerId: string }>>(Prisma.sql`
        SELECT favorite."providerId"
        FROM "Favorite" favorite
        INNER JOIN "ClientProfile" client ON client.id = favorite."clientId"
        INNER JOIN "ProviderProfile" provider ON provider.id = favorite."providerId"
        INNER JOIN "User" provider_user ON provider_user.id = provider."userId"
        WHERE client."userId" = ${req.user.userId}
          AND provider."verificationStatus" = 'VERIFIED'
          AND provider_user.status = 'ACTIVE'
          AND provider_user."profileVisible" = true
        ORDER BY favorite."createdAt" DESC
      `);
      return res.json(rows.map(row => row.providerId));
    } catch (error: any) {
      console.error('Erro ao listar favoritos:', error);
      return res.status(500).json({ error: 'Erro ao listar favoritos.' });
    }
  }

  static async add(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
      const providerId = String(req.params.providerId || '').trim();
      const [client, provider] = await Promise.all([
        prisma.clientProfile.findUnique({ where: { userId: req.user.userId }, select: { id: true } }),
        prisma.providerProfile.findFirst({
          where: {
            id: providerId,
            verificationStatus: 'VERIFIED',
            user: { status: 'ACTIVE', profileVisible: true },
          },
          select: { id: true },
        }),
      ]);
      if (!client) return res.status(404).json({ error: 'Perfil de cliente não encontrado.' });
      if (!provider) return res.status(404).json({ error: 'Profissional indisponível.' });

      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "Favorite" ("clientId", "providerId", "createdAt")
        VALUES (${client.id}, ${provider.id}, NOW())
        ON CONFLICT ("clientId", "providerId") DO NOTHING
      `);
      return res.status(201).json({ providerId: provider.id, isFavorite: true });
    } catch (error: any) {
      console.error('Erro ao adicionar favorito:', error);
      return res.status(500).json({ error: 'Erro ao adicionar favorito.' });
    }
  }

  static async remove(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
      const providerId = String(req.params.providerId || '').trim();
      await prisma.$executeRaw(Prisma.sql`
        DELETE FROM "Favorite" favorite
        USING "ClientProfile" client
        WHERE favorite."clientId" = client.id
          AND client."userId" = ${req.user.userId}
          AND favorite."providerId" = ${providerId}
      `);
      return res.status(204).send();
    } catch (error: any) {
      console.error('Erro ao remover favorito:', error);
      return res.status(500).json({ error: 'Erro ao remover favorito.' });
    }
  }
}
