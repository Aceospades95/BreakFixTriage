import { describe, it, expect } from "vitest";
import { JobStatus } from "@prisma/client";
import {
  DRIVER_ACTIONABLE_STATUSES,
  validateStopStatusTransition,
} from "@/lib/scheduling/stops";

describe("validateStopStatusTransition", () => {
  it("permits the happy path SCHEDULED → EN_ROUTE → ARRIVED → COMPLETED", () => {
    expect(
      validateStopStatusTransition(JobStatus.SCHEDULED, JobStatus.EN_ROUTE).ok,
    ).toBe(true);
    expect(
      validateStopStatusTransition(JobStatus.EN_ROUTE, JobStatus.ARRIVED).ok,
    ).toBe(true);
    expect(
      validateStopStatusTransition(JobStatus.ARRIVED, JobStatus.COMPLETED).ok,
    ).toBe(true);
  });

  it("requires ON_SITE (ARRIVED) before completing — no skipping from EN_ROUTE", () => {
    expect(
      validateStopStatusTransition(JobStatus.EN_ROUTE, JobStatus.COMPLETED).ok,
    ).toBe(false);
    expect(
      validateStopStatusTransition(JobStatus.ARRIVED, JobStatus.COMPLETED).ok,
    ).toBe(true);
  });

  it("permits PARTIAL only from ARRIVED", () => {
    expect(
      validateStopStatusTransition(JobStatus.ARRIVED, JobStatus.PARTIAL).ok,
    ).toBe(true);
    expect(
      validateStopStatusTransition(JobStatus.EN_ROUTE, JobStatus.PARTIAL).ok,
    ).toBe(false);
  });

  it("refuses to start a stop that is not SCHEDULED", () => {
    const result = validateStopStatusTransition(
      JobStatus.EN_ROUTE,
      JobStatus.EN_ROUTE,
    );
    // same-state is a no-op but still marked ok
    expect(result.ok).toBe(true);
    expect(
      validateStopStatusTransition(JobStatus.COMPLETED, JobStatus.EN_ROUTE).ok,
    ).toBe(false);
  });

  it("refuses to arrive from anywhere except EN_ROUTE", () => {
    expect(
      validateStopStatusTransition(JobStatus.SCHEDULED, JobStatus.ARRIVED).ok,
    ).toBe(false);
    expect(
      validateStopStatusTransition(JobStatus.COMPLETED, JobStatus.ARRIVED).ok,
    ).toBe(false);
  });

  it("allows failing from in-flight statuses only", () => {
    expect(
      validateStopStatusTransition(JobStatus.SCHEDULED, JobStatus.FAILED).ok,
    ).toBe(true);
    expect(
      validateStopStatusTransition(JobStatus.EN_ROUTE, JobStatus.FAILED).ok,
    ).toBe(true);
    expect(
      validateStopStatusTransition(JobStatus.ARRIVED, JobStatus.FAILED).ok,
    ).toBe(true);
    expect(
      validateStopStatusTransition(JobStatus.COMPLETED, JobStatus.FAILED).ok,
    ).toBe(false);
    expect(
      validateStopStatusTransition(JobStatus.CANCELLED, JobStatus.FAILED).ok,
    ).toBe(false);
  });

  it("rejects targets that are not driver-actionable", () => {
    expect(
      validateStopStatusTransition(
        JobStatus.SCHEDULED,
        JobStatus.UNSCHEDULED,
      ).ok,
    ).toBe(false);
    expect(
      validateStopStatusTransition(
        JobStatus.SCHEDULED,
        JobStatus.CANCELLED,
      ).ok,
    ).toBe(false);
    expect(
      validateStopStatusTransition(
        JobStatus.SCHEDULED,
        JobStatus.SCHEDULED,
      ).ok,
    ).toBe(false);
  });

  it("driver-actionable statuses matches the documented set", () => {
    expect(new Set(DRIVER_ACTIONABLE_STATUSES)).toEqual(
      new Set([
        JobStatus.EN_ROUTE,
        JobStatus.ARRIVED,
        JobStatus.COMPLETED,
        JobStatus.PARTIAL,
        JobStatus.FAILED,
      ]),
    );
  });
});
