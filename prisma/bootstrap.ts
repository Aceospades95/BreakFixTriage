/**
 * BreakFix Triage — startup bootstrap.
 *
 * This runs automatically on every container start (see the CMD in
 * Dockerfile). Its job is to ensure the minimum baseline the app needs to
 * function before any user logs in. Today that means exactly one thing:
 * an initial admin user.
 *
 * Everything here MUST be idempotent. Re-running on a populated database
 * should be a no-op.
 *
 * Bootstrap is intentionally separate from `prisma/seed.ts`. Seed creates
 * demo districts, schools, and example tickets for local exploration.
 * Bootstrap only creates the absolute minimum for production use.
 */

import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log(
      `[bootstrap] ${userCount} user(s) already exist — skipping admin creation.`,
    );
    return;
  }

  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@breakfix.local").trim();
  const name = (process.env.BOOTSTRAP_ADMIN_NAME ?? "BreakFix Admin").trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!password || password.length < 8) {
    console.warn(
      "[bootstrap] No users exist and BOOTSTRAP_ADMIN_PASSWORD is not set " +
        "(or is shorter than 8 characters). Skipping admin creation. Set " +
        "BOOTSTRAP_ADMIN_PASSWORD in the container environment and restart " +
        "this container to provision an initial admin user.",
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: Role.ADMIN,
      active: true,
    },
  });
  console.log(`[bootstrap] Created initial admin user: ${admin.email}`);
}

main()
  .catch((err) => {
    // Never crash the container from bootstrap. Log and proceed.
    // The app can still serve read-only traffic without an admin, and
    // schema migrations have already succeeded by the time we reach here.
    console.error("[bootstrap] Failed:", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
