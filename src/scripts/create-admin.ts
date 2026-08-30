import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const phone = String(process.env.ADMIN_PHONE || '').replace(/\D/g, '');
const password = String(process.env.ADMIN_PASSWORD || '');

async function createAdmin(): Promise<void> {
  database = (await import('../infrastructure/database/prisma.service')).prisma;
  const prisma = database;
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Defina ADMIN_EMAIL com um e-mail válido.');
  if (!/^[1-9]{2}9\d{8}$/.test(phone)) throw new Error('Defina ADMIN_PHONE com DDD e 11 dígitos.');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD deve possuir pelo menos 12 caracteres.');

  const [emailOwner, phoneOwner] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { phone } }),
  ]);
  if (emailOwner && emailOwner.role !== 'ADMIN') throw new Error('Este e-mail já pertence a uma conta comum. Nenhuma promoção foi realizada.');
  if (phoneOwner && phoneOwner.id !== emailOwner?.id) throw new Error('Este telefone já pertence a outra conta.');

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = emailOwner
    ? await prisma.user.update({
        where: { id: emailOwner.id },
        data: { phone, passwordHash, status: 'ACTIVE', emailVerified: true, phoneVerified: true },
        select: { id: true, email: true, role: true },
      })
    : await prisma.user.create({
        data: { email, phone, passwordHash, role: 'ADMIN', status: 'ACTIVE', emailVerified: true, phoneVerified: true },
        select: { id: true, email: true, role: true },
      });

  console.log(`Conta administrativa pronta: ${admin.email} (${admin.id})`);
}

let database: typeof import('../infrastructure/database/prisma.service')['prisma'] | undefined;

createAdmin()
  .catch(error => { console.error(`Não foi possível criar a conta administrativa: ${error.message}`); process.exitCode = 1; })
  .finally(async () => {
    await database?.$disconnect();
  });
