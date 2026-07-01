import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("Password123!", 12);
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-prize-house" },
    update: {},
    create: {
      name: "Demo Prize House",
      slug: "demo-prize-house",
      rounds: { create: { number: 1, status: "OPEN" } }
    }
  });

  // Ensure settings exist for the tenant
  await prisma.setting.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      adminFeePercentage: 10,
      ticketPrice: 200,
      firstPrize: 1000,
      secondPrize: 200,
      winnerRate: 0,
      currency: "ETB",
      language: "en",
      theme: "light"
    }
  });

  await prisma.user.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: { tenantId: tenant.id, name: "Demo Admin", email: "admin@demo.com", password, role: "ADMIN" }
  });

  await prisma.user.upsert({
    where: { email: "employee@demo.com" },
    update: {},
    create: { tenantId: tenant.id, name: "Demo Employee", email: "employee@demo.com", password, role: "EMPLOYEE" }
  });

  await prisma.participant.createMany({
    data: [
      { tenantId: tenant.id, fullName: "Maya Johnson", phoneNumber: "+1 202 555 0144", amountDeposited: 1200, balance: 1200 },
      { tenantId: tenant.id, fullName: "Omar Ruiz", phoneNumber: "+1 202 555 0178", amountDeposited: 900, balance: 900 },
      { tenantId: tenant.id, fullName: "Ari Chen", phoneNumber: "+1 202 555 0163", amountDeposited: 1500, balance: 1500 }
    ],
    skipDuplicates: true
  });
}

main().finally(async () => prisma.$disconnect());
