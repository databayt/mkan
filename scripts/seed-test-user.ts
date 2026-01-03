import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding test user...');

  const hashedPassword = await bcrypt.hash('123456', 10);

  const testUser = await prisma.user.upsert({
    where: { email: 'office@hotmail.com' },
    update: {
      password: hashedPassword,
      emailVerified: new Date()
    },
    create: {
      email: 'office@hotmail.com',
      username: 'Office Test User',
      password: hashedPassword,
      role: 'USER',
      emailVerified: new Date()
    }
  });

  console.log(`✅ Test user created/updated: ${testUser.email}`);
  console.log(`   Username: ${testUser.username}`);
  console.log(`   Role: ${testUser.role}`);
  console.log(`   Password: 123456`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
