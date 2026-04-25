import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "super@mkan.org";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "123456";
const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? "super-admin";

async function main() {
  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      role: UserRole.SUPER_ADMIN,
      emailVerified: new Date(),
      isSuspended: false,
      suspendedAt: null,
      suspensionReason: null,
    },
    create: {
      email: ADMIN_EMAIL,
      username: ADMIN_USERNAME,
      password: hashed,
      role: UserRole.SUPER_ADMIN,
      emailVerified: new Date(),
    },
    select: { id: true, email: true, username: true, role: true },
  });

  console.log("Super admin ready:", user);
  console.log(`Credentials: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
