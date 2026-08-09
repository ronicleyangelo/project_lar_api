import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.service';
import { SERVICE_CATEGORIES } from '../../domain/constants/service-categories';

export class CategoryController {
  public static async listCategories(req: Request, res: Response) {
    try {
      const categories = await prisma.category.findMany();
      return res.json(categories);
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao listar categorias.', details: error.message });
    }
  }

  public static async seedCategories(req: Request, res: Response) {
    try {
      for (const cat of SERVICE_CATEGORIES) {
        await prisma.category.upsert({
          where: { name: cat.name },
          update: { description: cat.description, icon: cat.icon },
          create: cat,
        });
      }

      const categories = await prisma.category.findMany();
      return res.json({ message: 'Categorias iniciais carregadas!', categories });
    } catch (error: any) {
      return res.status(500).json({ error: 'Erro ao popular categorias.', details: error.message });
    }
  }
}
