/**
 * Scan resolver.
 *
 * Given a string read from a QR code or barcode, figure out what
 * the shop is looking for and return the canonical href to navigate
 * to. Supports incident numbers, device serial numbers / asset
 * tags, loaner serial numbers, and part SKUs — everything a
 * warehouse employee might reasonably scan on the floor.
 *
 * The resolver is exported as a pure function that takes a
 * PrismaClient, so tests can swap in a mock without touching the
 * real database.
 */

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/prisma";

export type ScanHit =
  | { kind: "ticket"; id: string; label: string; href: string }
  | { kind: "device"; id: string; label: string; href: string }
  | { kind: "loaner"; id: string; label: string; href: string }
  | { kind: "part"; id: string; label: string; href: string }
  | { kind: "school"; id: string; label: string; href: string };

/**
 * Canonicalize a raw scan. Strips whitespace, uppercases, removes
 * common URL prefixes some QR label generators prepend. Kept as a
 * separate pure helper so tests can exercise it directly.
 */
export function normalizeScan(raw: string): string {
  let s = raw.trim();
  // If someone scanned a full URL (e.g. https://breakfix/tickets/abc),
  // take just the last path segment.
  try {
    const url = new URL(s);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      s = segments[segments.length - 1]!;
    }
  } catch {
    // Not a URL, leave as-is.
  }
  return s.trim();
}

/**
 * Query every entity table that can be identified by a scanned
 * string. Returns every match so a single scan can turn up both an
 * asset tag and a ticket number without ambiguity.
 */
export async function resolveScan(
  raw: string,
  db: PrismaClient = defaultPrisma,
): Promise<ScanHit[]> {
  const value = normalizeScan(raw);
  if (!value || value.length < 2) return [];

  const hits: ScanHit[] = [];

  const [ticket, device, loaner, part, school] = await Promise.all([
    db.ticket.findFirst({
      where: {
        OR: [
          { incidentNumber: { equals: value, mode: "insensitive" } },
          { id: value },
        ],
      },
      select: { id: true, incidentNumber: true },
    }),
    db.device.findFirst({
      where: {
        OR: [
          { serialNumber: { equals: value, mode: "insensitive" } },
          { assetTag: { equals: value, mode: "insensitive" } },
        ],
      },
      select: { id: true, serialNumber: true, assetTag: true },
    }),
    db.loanerDevice.findFirst({
      where: {
        OR: [
          { serialNumber: { equals: value, mode: "insensitive" } },
          { assetTag: { equals: value, mode: "insensitive" } },
        ],
      },
      select: { id: true, serialNumber: true, assetTag: true },
    }),
    db.part.findFirst({
      where: { sku: { equals: value, mode: "insensitive" } },
      select: { id: true, sku: true, name: true },
    }),
    db.school.findFirst({
      where: { code: { equals: value, mode: "insensitive" } },
      select: { id: true, name: true, code: true },
    }),
  ]);

  if (ticket) {
    hits.push({
      kind: "ticket",
      id: ticket.id,
      label: ticket.incidentNumber,
      href: `/tickets/${ticket.id}`,
    });
  }
  if (device) {
    hits.push({
      kind: "device",
      id: device.id,
      label: device.assetTag ?? device.serialNumber,
      href: `/admin/devices/${device.id}`,
    });
  }
  if (loaner) {
    hits.push({
      kind: "loaner",
      id: loaner.id,
      label: loaner.assetTag ?? loaner.serialNumber,
      href: `/admin/loaners/${loaner.id}`,
    });
  }
  if (part) {
    hits.push({
      kind: "part",
      id: part.id,
      label: `${part.sku} — ${part.name}`,
      href: `/admin/parts/${part.id}`,
    });
  }
  if (school) {
    hits.push({
      kind: "school",
      id: school.id,
      label: school.name,
      href: `/admin/schools/${school.id}`,
    });
  }

  return hits;
}
