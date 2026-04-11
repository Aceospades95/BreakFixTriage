import { describe, it, expect, beforeEach } from "vitest";
import { publish, subscribe, type AppEvent } from "@/lib/events/bus";

/**
 * The bus is an in-memory EventEmitter. Tests are simple:
 *  - published events reach subscribers synchronously
 *  - unsubscribe actually unsubscribes
 *  - multiple subscribers each get the same event
 */

describe("event bus", () => {
  let received: AppEvent[];
  let unsubscribe: () => void;

  beforeEach(() => {
    received = [];
    unsubscribe = subscribe((e) => received.push(e));
  });

  it("delivers a published event to a subscriber", () => {
    publish({ topic: "tickets.changed", ticketId: "t_1" });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      topic: "tickets.changed",
      ticketId: "t_1",
    });
    unsubscribe();
  });

  it("delivers every published event in order", () => {
    publish({ topic: "tickets.changed", ticketId: "t_1" });
    publish({ topic: "tickets.changed", ticketId: "t_2" });
    publish({ topic: "routes.changed", routeId: "r_9" });
    expect(received).toHaveLength(3);
    expect((received[0] as { ticketId: string }).ticketId).toBe("t_1");
    expect((received[1] as { ticketId: string }).ticketId).toBe("t_2");
    expect((received[2] as { routeId: string }).routeId).toBe("r_9");
    unsubscribe();
  });

  it("stops delivering after unsubscribe", () => {
    publish({ topic: "tickets.changed", ticketId: "before" });
    unsubscribe();
    publish({ topic: "tickets.changed", ticketId: "after" });
    expect(received).toHaveLength(1);
    expect((received[0] as { ticketId: string }).ticketId).toBe("before");
  });

  it("fans out to multiple subscribers", () => {
    const other: AppEvent[] = [];
    const off2 = subscribe((e) => other.push(e));
    publish({ topic: "tickets.bulk-changed", reason: "test" });
    expect(received).toHaveLength(1);
    expect(other).toHaveLength(1);
    unsubscribe();
    off2();
  });
});
