import type { TicketState } from "@prisma/client";

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

export class InvalidTransitionError extends WorkflowError {
  constructor(
    readonly ticketId: string,
    readonly from: TicketState,
    readonly to: TicketState,
  ) {
    super(
      `Invalid transition on ticket ${ticketId}: ${from} → ${to} is not allowed`,
    );
    this.name = "InvalidTransitionError";
  }
}

export class GuardFailedError extends WorkflowError {
  constructor(
    readonly ticketId: string,
    readonly from: TicketState,
    readonly to: TicketState,
    readonly guard: string,
    reason: string,
  ) {
    super(
      `Transition ${from} → ${to} on ticket ${ticketId} failed guard ${guard}: ${reason}`,
    );
    this.name = "GuardFailedError";
  }
}
