import { afterAll, describe, expect, it } from "vitest";
import { JobStatus, JobType, PrismaClient, RouteStatus } from "@prisma/client";
import { prisma as appPrisma } from "@/lib/db/prisma";
import {
  StopUpdateRefusedError,
  updateStopStatus,
} from "@/lib/scheduling/stops";
import { ensureIntegrationDistrict } from "./helpers";

/**
 * Phase-0 reliability suite — June 2026 incident class.
 *
 * The production incident: a stop Complete returned 503 with its write
 * committed, then two Fail attempts on the same route hung > 2 minutes
 * and only materialised (exactly once) after a container restart. The
 * mechanism class is unbounded waits (no statement/lock/idle-transaction
 * timeouts anywhere) plus non-atomic action writes. These tests pin the
 * fixes:
 *
 *   1. The Postgres session guard-rails are actually live on the app's
 *      connections (statement_timeout / lock_timeout /
 *      idle_in_transaction_session_timeout).
 *   2. A row lock held by another session makes a stop update FAIL FAST
 *      with an error instead of hanging — the incident's exact shape.
 *   3. A duplicated/concurrent identical transition commits exactly
 *      once: one audit row, one ticket cascade, both callers settle.
 *   4. A refused completion (unconfirmed device lines) rolls back
 *      atomically — no half-stamped confirmations.
 *   5. Killing the DB connection mid-transaction rejects the call and
 *      leaves no partial state.
 *
 * Skipped without DATABASE_URL.
 */

const RUN_TAG = `srel-${Date.now()}`;

async function createFixture(opts?: { withDevice?: boolean }) {
  const district = await ensureIntegrationDistrict(appPrisma);
  const school = await appPrisma.school.upsert({
    where: { code: "IT-SCH-SREL" },
    create: {
      code: "IT-SCH-SREL",
      name: "Reliability School",
      districtId: district.id,
    },
    update: {},
  });
  const driver = await appPrisma.user.upsert({
    where: { email: "srel-driver@integration.test" },
    create: {
      email: "srel-driver@integration.test",
      name: "SREL Driver",
      role: "DRIVER",
    },
    update: {},
  });
  const ticket = await appPrisma.ticket.create({
    data: {
      incidentNumber: `INC${RUN_TAG}-${Math.random().toString(36).slice(2, 8)}`,
      shortDescription: "reliability fixture",
      state: "PICKUP_SCHEDULED",
      schoolId: school.id,
      reportedAt: new Date(),
    },
  });
  const job = await appPrisma.job.create({
    data: {
      type: JobType.PICKUP,
      schoolId: school.id,
      status: JobStatus.SCHEDULED,
      ticketLinks: { create: { ticketId: ticket.id } },
    },
  });
  const route = await appPrisma.route.create({
    data: {
      date: new Date(),
      assigneeUserId: driver.id,
      status: RouteStatus.PLANNED,
      stops: {
        // proofRule NONE keeps these reliability cases focused on the
        // transaction/locking behaviour, not the proof gate.
        create: {
          jobId: job.id,
          sequence: 1,
          status: JobStatus.SCHEDULED,
          proofRule: "NONE",
        },
      },
    },
    include: { stops: true },
  });
  const stop = route.stops[0]!;

  let stopDeviceId: string | null = null;
  if (opts?.withDevice) {
    const device = await appPrisma.device.create({
      data: { serialNumber: `SREL-${RUN_TAG}-${Math.random().toString(36).slice(2, 8)}` },
    });
    const sd = await appPrisma.stopDevice.create({
      data: {
        stopId: stop.id,
        deviceId: device.id,
        ticketId: ticket.id,
        addedByUserId: driver.id,
      },
    });
    stopDeviceId = sd.id;
  }

  return { ticket, stop, driver, stopDeviceId };
}

describe.skipIf(!process.env.DATABASE_URL)("stop reliability (Phase 0)", () => {
  afterAll(async () => {
    // StopDevice has no delete cascade from Device/Ticket — remove the
    // link rows first, then the fixtures.
    await appPrisma.stopDevice.deleteMany({
      where: { device: { serialNumber: { startsWith: `SREL-${RUN_TAG}` } } },
    });
    await appPrisma.ticket.deleteMany({
      where: { incidentNumber: { startsWith: `INC${RUN_TAG}` } },
    });
    await appPrisma.device.deleteMany({
      where: { serialNumber: { startsWith: `SREL-${RUN_TAG}` } },
    });
    await appPrisma.$disconnect();
  });

  it("the session guard-rails are live on app connections", async () => {
    const rows = await appPrisma.$queryRaw<
      { name: string; setting: string }[]
    >`SELECT name, setting FROM pg_settings WHERE name IN ('statement_timeout','lock_timeout','idle_in_transaction_session_timeout')`;
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.setting]));
    // Non-zero = bounded. The exact values come from DATABASE_URL (or
    // the injected defaults); what matters is that none of them is the
    // Postgres default of 0 = "wait forever".
    expect(Number(byName.statement_timeout)).toBeGreaterThan(0);
    expect(Number(byName.lock_timeout)).toBeGreaterThan(0);
    expect(
      Number(byName.idle_in_transaction_session_timeout),
    ).toBeGreaterThan(0);
  });

  it(
    "a row lock held elsewhere fails the update fast instead of hanging (incident shape)",
    { timeout: 30_000 },
    async () => {
      const { ticket, stop, driver } = await createFixture();

      // Session A: hold a row lock on the stop, exactly what a wedged
      // transaction did in production.
      let releaseHolder!: () => void;
      const held = new Promise<void>((r) => (releaseHolder = r));
      let lockTaken!: () => void;
      const lockReady = new Promise<void>((r) => (lockTaken = r));
      const holder = appPrisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "RouteStop" WHERE id = ${stop.id} FOR UPDATE`;
          lockTaken();
          await held;
        },
        { timeout: 25_000 },
      );
      await lockReady;

      // Session B: the driver hits Fail. Pre-fix this waited on the
      // lock indefinitely; now lock_timeout must surface an error in
      // bounded time.
      const startedAt = Date.now();
      await expect(
        updateStopStatus({
          stopId: stop.id,
          status: JobStatus.FAILED,
          actorUserId: driver.id,
          reason: "School closed",
        }),
      ).rejects.toThrow();
      const elapsed = Date.now() - startedAt;
      // lock_timeout defaults to 10s via the injected URL options;
      // anything under 15s proves "bounded error", not "hang".
      expect(elapsed).toBeLessThan(15_000);

      releaseHolder();
      await holder;

      // Nothing partial: status unchanged, no transition audit row,
      // ticket untouched.
      const after = await appPrisma.routeStop.findUniqueOrThrow({
        where: { id: stop.id },
      });
      expect(after.status).toBe(JobStatus.SCHEDULED);
      expect(after.failureReason).toBeNull();
      const audits = await appPrisma.auditLog.count({
        where: { entityType: "RouteStop", entityId: stop.id },
      });
      expect(audits).toBe(0);
      const t = await appPrisma.ticket.findUniqueOrThrow({
        where: { id: ticket.id },
      });
      expect(t.state).toBe("PICKUP_SCHEDULED");
    },
  );

  it(
    "a duplicated Fail commits exactly once (one audit row, one cascade)",
    { timeout: 20_000 },
    async () => {
      const { ticket, stop, driver } = await createFixture();

      const results = await Promise.allSettled([
        updateStopStatus({
          stopId: stop.id,
          status: JobStatus.FAILED,
          actorUserId: driver.id,
          reason: "School closed",
        }),
        updateStopStatus({
          stopId: stop.id,
          status: JobStatus.FAILED,
          actorUserId: driver.id,
          reason: "School closed",
        }),
      ]);
      // Both submissions settle successfully — the loser becomes an
      // idempotent no-op, never an error and never a duplicate.
      expect(results.map((r) => r.status)).toEqual([
        "fulfilled",
        "fulfilled",
      ]);

      const after = await appPrisma.routeStop.findUniqueOrThrow({
        where: { id: stop.id },
      });
      expect(after.status).toBe(JobStatus.FAILED);
      expect(after.failureReason).toBe("School closed");

      const transitionAudits = await appPrisma.auditLog.count({
        where: {
          entityType: "RouteStop",
          entityId: stop.id,
          action: `status:${JobStatus.SCHEDULED}->${JobStatus.FAILED}`,
        },
      });
      expect(transitionAudits).toBe(1);

      const ticketEvents = await appPrisma.ticketEvent.count({
        where: { ticketId: ticket.id },
      });
      expect(ticketEvents).toBe(1);
      const t = await appPrisma.ticket.findUniqueOrThrow({
        where: { id: ticket.id },
      });
      expect(t.state).toBe("AWAITING_PICKUP");
    },
  );

  it("a refused completion rolls back atomically — no half-stamped resolutions", async () => {
    const { stop, driver, stopDeviceId } = await createFixture({
      withDevice: true,
    });
    await updateStopStatus({
      stopId: stop.id,
      status: JobStatus.EN_ROUTE,
      actorUserId: driver.id,
    });
    await updateStopStatus({
      stopId: stop.id,
      status: JobStatus.ARRIVED,
      actorUserId: driver.id,
    });

    // Complete without resolving the line — must be refused with the
    // operator-facing message...
    await expect(
      updateStopStatus({
        stopId: stop.id,
        status: JobStatus.COMPLETED,
        actorUserId: driver.id,
        lineResolutions: [],
      }),
    ).rejects.toThrow(StopUpdateRefusedError);

    // ...and the refusal must leave NOTHING behind: pre-fix, the
    // confirmation stamps ran outside the transaction and survived a
    // refused transition.
    const sd = await appPrisma.stopDevice.findUniqueOrThrow({
      where: { id: stopDeviceId! },
    });
    expect(sd.confirmedAt).toBeNull();
    expect(sd.lineState).toBe("EXPECTED");
    const after = await appPrisma.routeStop.findUniqueOrThrow({
      where: { id: stop.id },
    });
    expect(after.status).toBe(JobStatus.ARRIVED);

    // Verifying the line completes the stop and stamps the check-off in
    // the same transaction.
    await updateStopStatus({
      stopId: stop.id,
      status: JobStatus.COMPLETED,
      actorUserId: driver.id,
      lineResolutions: [{ stopDeviceId: stopDeviceId!, state: "VERIFIED" }],
    });
    const sdAfter = await appPrisma.stopDevice.findUniqueOrThrow({
      where: { id: stopDeviceId! },
    });
    expect(sdAfter.confirmedAt).not.toBeNull();
    expect(sdAfter.confirmedByUserId).toBe(driver.id);
    expect(sdAfter.lineState).toBe("VERIFIED");
    const done = await appPrisma.routeStop.findUniqueOrThrow({
      where: { id: stop.id },
    });
    expect(done.status).toBe(JobStatus.COMPLETED);
  });

  it(
    "killing the DB connection mid-transaction rejects and commits nothing",
    { timeout: 20_000 },
    async () => {
      const { stop } = await createFixture();
      const sniper = new PrismaClient();
      try {
        const victim = appPrisma.$transaction(async (tx) => {
          await tx.routeStop.update({
            where: { id: stop.id },
            data: { status: JobStatus.EN_ROUTE },
          });
          // Park the transaction so the sniper can find and kill it.
          await tx.$queryRaw`SELECT pg_sleep(8), 'srel-victim'`;
        });
        // The rejection lands while we're still sniping below — mark it
        // handled now so the runner doesn't flag an unhandled rejection.
        victim.catch(() => {});

        // Find the parked backend and terminate it — the in-test
        // equivalent of the DB going away mid-action.
        let killed = false;
        for (let attempt = 0; attempt < 40 && !killed; attempt++) {
          const rows = await sniper.$queryRaw<{ pid: number }[]>`
            SELECT pid FROM pg_stat_activity
            WHERE query LIKE '%srel-victim%'
              AND state = 'active'
              AND pid <> pg_backend_pid()`;
          if (rows.length > 0) {
            await sniper.$queryRaw`SELECT pg_terminate_backend(${rows[0]!.pid}::int)`;
            killed = true;
          } else {
            await new Promise((r) => setTimeout(r, 100));
          }
        }
        expect(killed).toBe(true);

        // The caller gets an error, not a hang...
        await expect(victim).rejects.toThrow();

        // ...and the write inside the killed transaction is gone.
        const after = await sniper.routeStop.findUniqueOrThrow({
          where: { id: stop.id },
        });
        expect(after.status).toBe(JobStatus.SCHEDULED);
      } finally {
        await sniper.$disconnect();
      }
    },
  );
});
