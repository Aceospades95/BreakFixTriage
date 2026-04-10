/**
 * ServiceNow sync entrypoint.
 *
 * Run this on a schedule to pull fresh incidents from the configured
 * ServiceNow instance and feed them through the normal import commit
 * pipeline:
 *
 *   npx tsx prisma/sync-servicenow.ts
 *
 * Environment variables:
 *   SERVICENOW_BASE_URL       (required) e.g. https://nyc.service-now.com
 *   SERVICENOW_USERNAME       (required) integration user
 *   SERVICENOW_PASSWORD       (required) integration password
 *   SERVICENOW_QUERY          (optional) sysparm_query override
 *   SERVICENOW_LIMIT          (optional) batch size, default 200
 *   SERVICENOW_SYNC_USER_EMAIL (optional) user email stamped on the
 *       resulting ImportBatch (defaults to the first ADMIN).
 *
 * Exits 0 on success, 1 on any error.
 */

import { prisma } from "../src/lib/db/prisma";
import {
  loadServiceNowConfigFromEnv,
  runServiceNowSync,
} from "../src/lib/import/servicenow";

async function resolveActorId(): Promise<string> {
  const explicit = process.env.SERVICENOW_SYNC_USER_EMAIL;
  if (explicit) {
    const user = await prisma.user.findUnique({ where: { email: explicit } });
    if (!user) {
      throw new Error(
        `SERVICENOW_SYNC_USER_EMAIL=${explicit} does not match any user`,
      );
    }
    return user.id;
  }
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", active: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    throw new Error(
      "No ADMIN user found; create one (e.g. via BOOTSTRAP_ADMIN_*) before syncing",
    );
  }
  return admin.id;
}

async function main() {
  const config = loadServiceNowConfigFromEnv();
  if (!config) {
    console.error(
      "ServiceNow not configured — set SERVICENOW_BASE_URL, SERVICENOW_USERNAME, and SERVICENOW_PASSWORD",
    );
    process.exit(1);
  }
  const actorUserId = await resolveActorId();
  const result = await runServiceNowSync({
    config,
    triggeredByUserId: actorUserId,
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
