import { SERVICE_CATEGORIES } from '../../domain/constants/service-categories';
import { prisma } from './prisma.service';

async function syncCategories(): Promise<void> {
  const categories = await Promise.all(SERVICE_CATEGORIES.map(category =>
    prisma.category.upsert({
      where: { name: category.name },
      update: { description: category.description, icon: category.icon },
      create: category,
    })
  ));

  console.log(`${categories.length} categorias sincronizadas.`);
}

syncCategories()
  .catch(error => {
    console.error('Erro ao sincronizar categorias:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
