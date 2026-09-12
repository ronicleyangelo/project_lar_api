import { prisma } from '../../../infrastructure/database/prisma.service';
import { AccountRepository } from '../domain/account.repository';
import { PrivacyPreferences } from '../domain/account';

export class PrismaAccountRepository implements AccountRepository {
  findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, role: true, status: true, emailVerified: true,
        googleId: true, passwordHash: true, profileVisible: true,
        allowRecommendations: true, createdAt: true, deletionRequestedAt: true, scheduledDeletionAt: true,
      },
    });
  }
  async updatePrivacy(id: string, preferences: PrivacyPreferences): Promise<void> {
    await prisma.user.update({ where: { id }, data: preferences });
  }
  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await prisma.user.update({ where: { id }, data: { passwordHash } });
  }
  async hasBlockingActivity(id: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        clientProfile: { select: { appointments: { where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } }, select: { id: true }, take: 1 } } },
        providerProfile: { select: { appointments: { where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } }, select: { id: true }, take: 1 } } },
        disputesReported: { where: { status: 'OPEN' }, select: { id: true }, take: 1 },
      },
    });
    return !!(user?.clientProfile?.appointments.length || user?.providerProfile?.appointments.length || user?.disputesReported.length);
  }
  async requestDeletion(id: string, requestedAt: Date, scheduledAt: Date): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: { status: 'DELETION_PENDING', deletionRequestedAt: requestedAt, scheduledDeletionAt: scheduledAt, profileVisible: false },
    });
  }
  async cancelDeletion(id: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: { status: 'ACTIVE', deletionRequestedAt: null, scheduledDeletionAt: null },
    });
  }

  async exportData(id: string): Promise<unknown | null> {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        clientProfile: {
          include: {
            serviceRequests: { include: { quotes: true } },
            appointments: true,
            reviewsGiven: true,
            favorites: true,
          },
        },
        providerProfile: {
          include: {
            services: { include: { category: true } },
            coverageAreas: true,
            quotes: true,
            appointments: true,
            reviewsReceived: true,
          },
        },
        auditLogs: true,
        disputesReported: true,
      },
    });
    if (!user) return null;
    const { passwordHash, googleId, ...data } = user;
    return {
      exportedAt: new Date().toISOString(),
      googleLinked: Boolean(googleId),
      ...data,
    };
  }
}
