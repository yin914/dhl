import { prisma } from "../lib/prisma";
import { ScryptPasswordHasher } from "../server/services/repository/argon2.passwordhasher";

const demoUsers = [
  {
    name: "Alex Rodriguez",
    email: "superadmin@dhlfastlink.com",
    role: "superadmin",
    staffId: "DHLFastLink-DIR-001",
    hub: "Global Operations Headquarters",
    department: "Executive Logistics Command",
    phone: "+44 20 7946 0991",
    avatarUrl: "https://picsum.photos/seed/superadmin/120/120",
  },
  {
    name: "Sarah Jenkins",
    email: "admin@dhlfastlink.com",
    role: "admin",
    staffId: "DHLFastLink-MGR-442",
    hub: "London Central Gateway",
    department: "Dispatch & Fleet Logistics",
    phone: "+44 20 7946 0834",
    avatarUrl: "https://picsum.photos/seed/admin/120/120",
  },
  {
    name: "Customer User",
    email: "customer@dhlfastlink.com",
    role: "customer",
    staffId: "DHLFastLink-CUST-001",
    hub: "London Central Gateway",
    department: "Retail Logistics",
    phone: "+44 20 7946 0000",
    avatarUrl: "https://picsum.photos/seed/customer/120/120",
  },
  {
    name: "Marcus Vance",
    email: "driver@dhlfastlink.com",
    role: "driver",
    staffId: "DHLFastLink-DRV-101",
    hub: "London Central Gateway",
    vehicleId: "DHLFastLink-V-901",
    department: "Express Last-Mile Courier",
    phone: "+1 (555) 234-5678",
    avatarUrl: "https://picsum.photos/seed/driver1/120/120",
  },
] as const;

async function main() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;
  const allowLocalSeed = process.env.ALLOW_LOCAL_AUTH_SEED === "true";
  const seedPassword = process.env.SEED_DEFAULT_PASSWORD || "password123";
  const resetExistingUsers = process.env.RESET_DEMO_AUTH_USERS === "true";

  if (Boolean(tursoUrl) !== Boolean(tursoAuthToken)) {
    throw new Error(
      "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must both be configured.",
    );
  }

  if (!tursoUrl && !allowLocalSeed) {
    throw new Error(
      "No Turso database is configured. Set ALLOW_LOCAL_AUTH_SEED=true to explicitly target local SQLite.",
    );
  }

  if (tursoUrl && !process.env.SEED_DEFAULT_PASSWORD) {
    throw new Error(
      "Set SEED_DEFAULT_PASSWORD explicitly before seeding demo accounts in Turso.",
    );
  }

  if (seedPassword !== "password123") {
    console.warn(
      "The built-in quick demo login sends password123 and will not work with the configured seed password.",
    );
  }

  const passwordHasher = new ScryptPasswordHasher();
  let createdCount = 0;
  let existingCount = 0;

  for (const user of demoUsers) {
    const existing = await prisma.authUser.findFirst({
      where: {
        OR: [{ email: user.email }, { staffId: user.staffId }],
      },
    });

    if (existing) {
      if (existing.email !== user.email || existing.staffId !== user.staffId) {
        throw new Error(
          `Cannot seed ${user.email}: its email or staff ID is already assigned to another account.`,
        );
      }

      const passwordMatches = await passwordHasher.verify(
        existing.passwordHash,
        seedPassword,
      );

      if (resetExistingUsers) {
        await prisma.authUser.update({
          where: { id: existing.id },
          data: {
            passwordHash: await passwordHasher.hash(seedPassword),
            isActive: true,
          },
        });
        console.info(`Reset demo account credentials: ${user.email}`);
      } else {
        console.info(
          `Preserved existing account ${user.email} (active: ${existing.isActive}, password matches configured seed password: ${passwordMatches}).`,
        );
      }

      existingCount += 1;
      continue;
    }

    await prisma.authUser.create({
      data: {
        ...user,
        passwordHash: await passwordHasher.hash(seedPassword),
        isActive: true,
      },
    });
    console.info(`Created demo account: ${user.email}`);
    createdCount += 1;
  }

  console.info(
    `Auth-only seed complete. Created ${createdCount}; preserved or reset ${existingCount}.`,
  );
}

main()
  .catch((error) => {
    console.error("Auth-only seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
