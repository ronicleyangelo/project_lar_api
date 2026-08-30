import { prisma } from './prisma.service';
import { PasswordHasher } from '../security/password.hasher';
import { SERVICE_CATEGORIES } from '../../domain/constants/service-categories';

async function seed() {
  console.log('Seeding initial data for Projeto Lar...');

  // 1. Initial Categories
  const categories = await Promise.all(SERVICE_CATEGORIES.map(category =>
    prisma.category.upsert({
      where: { name: category.name },
      update: { description: category.description, icon: category.icon },
      create: category,
    })
  ));
  const catLimpeza = categories.find(category => category.name === 'Limpeza Residencial')!;

  console.log('Categories created:', categories.map(category => category.name).join(', '));

  // 2. Default Password
  const passwordHash = await PasswordHasher.hash('123456');

  // 3. Admin User
  await prisma.user.upsert({
    where: { email: 'admin@projetolar.com.br' },
    update: {},
    create: {
      email: 'admin@projetolar.com.br',
      phone: '(11) 99999-0000',
      passwordHash,
      role: 'ADMIN',
    },
  });

  // 4. Sample Client
  const clientUser = await prisma.user.upsert({
    where: { email: 'cliente@exemplo.com' },
    update: {},
    create: {
      email: 'cliente@exemplo.com',
      phone: '(11) 98888-1111',
      passwordHash,
      role: 'CLIENT',
      clientProfile: {
        create: {
          fullName: 'Maria da Silva',
          neighborhood: 'Moema',
          city: 'São Paulo',
          fullAddress: 'Rua Normandia, 150, Apto 42 - Moema, São Paulo - SP',
          latitude: -23.6000,
          longitude: -46.6667,
        },
      },
    },
  });

  // 5. Sample Providers
  const provider1User = await prisma.user.upsert({
    where: { email: 'ana.limpeza@exemplo.com' },
    update: {},
    create: {
      email: 'ana.limpeza@exemplo.com',
      phone: '(11) 97777-2222',
      passwordHash,
      role: 'PROVIDER',
      providerProfile: {
        create: {
          fullName: 'Ana Paula Santos',
          bio: 'Especialista em limpeza residencial e organização de ambientes com mais de 7 anos de experiência.',
          photoUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
          serviceRadiusKm: 8.0,
          trustScore: 4.85,
          reviewCount: 14,
          isVerified: true,
          isNewProvider: false,
          coverageAreas: {
            create: [
              { city: 'São Paulo', neighborhood: 'Moema', latitude: -23.6000, longitude: -46.6667 },
              { city: 'São Paulo', neighborhood: 'Vila Mariana', latitude: -23.5833, longitude: -46.6333 },
            ],
          },
          services: {
            create: [
              { categoryId: catLimpeza.id, basePrice: 150.0, description: 'Diária completa de limpeza de até 8 horas.' },
            ],
          },
        },
      },
    },
  });

  const provider2User = await prisma.user.upsert({
    where: { email: 'carlos.reparos@exemplo.com' },
    update: {},
    create: {
      email: 'bruna.faxina@exemplo.com',
      phone: '(11) 96666-3333',
      passwordHash,
      role: 'PROVIDER',
      providerProfile: {
        create: {
          fullName: 'Bruna Oliveira',
          bio: 'Profissional de faxina residencial, com experiência em casas, apartamentos e limpezas recorrentes.',
          photoUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150',
          serviceRadiusKm: 12.0,
          trustScore: 4.90,
          reviewCount: 22,
          isVerified: true,
          isNewProvider: false,
          coverageAreas: {
            create: [
              { city: 'São Paulo', neighborhood: 'Moema', latitude: -23.6000, longitude: -46.6667 },
              { city: 'São Paulo', neighborhood: 'Pinheiros', latitude: -23.5667, longitude: -46.7000 },
            ],
          },
          services: {
            create: [
              { categoryId: catLimpeza.id, basePrice: 140.0, description: 'Faxina residencial completa.' },
            ],
          },
        },
      },
    },
  });

  console.log('Seed completed successfully!');
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
