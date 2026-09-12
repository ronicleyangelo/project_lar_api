import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.service';
import { SERVICE_ACTIVITIES } from '../../domain/constants/service-activities';

export class ActivityController {
  static async list(_req: Request, res: Response) {
    try {
      await prisma.$transaction(SERVICE_ACTIVITIES.map(item => prisma.serviceActivity.upsert({
        where: { code: item.code },
        update: { name: item.name, description: item.description, includedByDefault: item.includedByDefault, suggestedMinutes: item.suggestedMinutes, defaultExtraPrice: item.defaultExtraPrice, active: true },
        create: item,
      })));
      return res.json(await prisma.serviceActivity.findMany({ where: { active: true }, orderBy: [{ includedByDefault: 'desc' }, { name: 'asc' }] }));
    } catch (error: any) {
      console.error('Erro ao listar atividades:', error);
      return res.status(500).json({ error: 'Erro ao listar atividades.' });
    }
  }
}
