import { describe, it, expect, vi } from "vitest";
import {
  resolveRecipients,
  isRecipientSet,
} from "@/lib/email/recipients";

/**
 * Round-2 §3 — recipient resolver contract.
 *
 * Tests use a hand-rolled mock prisma + a stubbed
 * getWynndalcoTeamEmails. The resolver only touches three
 * collections: contact (for spoc), ticket (for reporter), and
 * the wynndalco team list. Each kind is exercised independently.
 */

vi.mock("@/lib/settings/settings", () => ({
  getWynndalcoTeamEmails: vi.fn(async () => [
    "team@wynndalco.com",
    "ops@wynndalco.com",
  ]),
}));

function makeDb(overrides: Partial<{
  contacts: Array<{ email: string | null }>;
  ticket: { id: string; schoolId: string; meta: unknown } | null;
}> = {}) {
  return {
    contact: {
      findMany: vi.fn(async () => overrides.contacts ?? []),
    },
    ticket: {
      findUnique: vi.fn(async () => overrides.ticket ?? null),
    },
  } as unknown as Parameters<typeof resolveRecipients>[2];
}

describe("resolveRecipients", () => {
  it("expands a literal recipient verbatim and lowercases it", async () => {
    const out = await resolveRecipients(
      {
        to: [{ kind: "literal", value: "Foo@Example.COM" }],
        cc: [],
        bcc: [],
      },
      { family: "ticket" },
      makeDb(),
    );
    expect(out.to).toEqual(["foo@example.com"]);
  });

  it("expands wynndalco_team from the settings list", async () => {
    const out = await resolveRecipients(
      { to: [{ kind: "wynndalco_team" }], cc: [], bcc: [] },
      { family: "internal" },
      makeDb(),
    );
    expect(out.to).toEqual([
      "team@wynndalco.com",
      "ops@wynndalco.com",
    ]);
  });

  it("expands spoc to the school's opted-in contacts for the family", async () => {
    const out = await resolveRecipients(
      { to: [{ kind: "spoc" }], cc: [], bcc: [] },
      {
        family: "ticket",
        schoolId: "school-1",
      },
      makeDb({
        contacts: [{ email: "lead@school.example" }, { email: null }],
      }),
    );
    expect(out.to).toEqual(["lead@school.example"]);
  });

  it("expands ticket_reporter from ticket.meta.requesterEmail", async () => {
    const out = await resolveRecipients(
      { to: [{ kind: "ticket_reporter" }], cc: [], bcc: [] },
      {
        family: "ticket",
        ticket: {
          id: "t1",
          schoolId: "s1",
          meta: { requesterEmail: "Reporter@Example.com" },
        },
      },
      makeDb(),
    );
    expect(out.to).toEqual(["reporter@example.com"]);
  });

  it("dedupes across kinds (same address on literal + spoc)", async () => {
    const out = await resolveRecipients(
      {
        to: [
          { kind: "literal", value: "shared@school.example" },
          { kind: "spoc" },
        ],
        cc: [],
        bcc: [],
      },
      { family: "ticket", schoolId: "s1" },
      makeDb({
        contacts: [{ email: "shared@school.example" }],
      }),
    );
    expect(out.to).toEqual(["shared@school.example"]);
  });

  it("returns empty `to` when no recipient resolves", async () => {
    const out = await resolveRecipients(
      { to: [{ kind: "ticket_reporter" }], cc: [], bcc: [] },
      { family: "ticket", ticket: { id: "t1", schoolId: "s1", meta: {} } },
      makeDb(),
    );
    expect(out.to).toEqual([]);
  });

  it("ignores spoc opt-ins for the wrong family (delivery flag does not unlock ticket family)", async () => {
    // Contact opted into delivery receipts but NOT ticket emails
    // — `family: "ticket"` should resolve to no contacts.
    const out = await resolveRecipients(
      { to: [{ kind: "spoc" }], cc: [], bcc: [] },
      { family: "ticket", schoolId: "s1" },
      makeDb({ contacts: [] }), // mock returns the post-where filter
    );
    expect(out.to).toEqual([]);
  });
});

describe("isRecipientSet", () => {
  it("accepts a well-shaped set", () => {
    expect(
      isRecipientSet({
        to: [{ kind: "spoc" }],
        cc: [],
        bcc: [],
      }),
    ).toBe(true);
  });

  it("rejects missing arrays", () => {
    expect(isRecipientSet({ to: [], cc: [] })).toBe(false);
  });

  it("rejects unknown kinds", () => {
    expect(
      isRecipientSet({
        to: [{ kind: "ceo" }],
        cc: [],
        bcc: [],
      }),
    ).toBe(false);
  });
});
