import { describe, it, expect } from "vitest";
import { PartMovementKind } from "@prisma/client";
import {
  signedQuantity,
  wouldGoNegative,
} from "@/lib/parts/inventory";

describe("signedQuantity", () => {
  it("returns positive delta for RECEIVED", () => {
    expect(signedQuantity(PartMovementKind.RECEIVED, 5)).toBe(5);
    // Abs-values a negative input so nobody accidentally subtracts
    // stock via the receive form.
    expect(signedQuantity(PartMovementKind.RECEIVED, -5)).toBe(5);
  });

  it("returns negative delta for CONSUMED", () => {
    expect(signedQuantity(PartMovementKind.CONSUMED, 3)).toBe(-3);
    expect(signedQuantity(PartMovementKind.CONSUMED, -3)).toBe(-3);
  });

  it("returns negative delta for RETURNED and SCRAPPED", () => {
    expect(signedQuantity(PartMovementKind.RETURNED, 2)).toBe(-2);
    expect(signedQuantity(PartMovementKind.SCRAPPED, 1)).toBe(-1);
  });

  it("passes ADJUSTMENT through with its sign preserved", () => {
    expect(signedQuantity(PartMovementKind.ADJUSTMENT, 5)).toBe(5);
    expect(signedQuantity(PartMovementKind.ADJUSTMENT, -3)).toBe(-3);
  });

  it("floors fractional quantities", () => {
    expect(signedQuantity(PartMovementKind.RECEIVED, 3.9)).toBe(3);
    expect(signedQuantity(PartMovementKind.ADJUSTMENT, 2.7)).toBe(2);
  });
});

describe("wouldGoNegative", () => {
  it("flags consumption that would overdraw stock", () => {
    expect(
      wouldGoNegative(2, PartMovementKind.CONSUMED, 3),
    ).toBe(true);
  });

  it("allows consumption that leaves non-negative stock", () => {
    expect(
      wouldGoNegative(5, PartMovementKind.CONSUMED, 3),
    ).toBe(false);
    expect(
      wouldGoNegative(3, PartMovementKind.CONSUMED, 3),
    ).toBe(false);
  });

  it("never flags RECEIVED movements", () => {
    expect(
      wouldGoNegative(0, PartMovementKind.RECEIVED, 10),
    ).toBe(false);
  });

  it("flags a negative ADJUSTMENT that overdraws stock", () => {
    expect(
      wouldGoNegative(1, PartMovementKind.ADJUSTMENT, -5),
    ).toBe(true);
    expect(
      wouldGoNegative(10, PartMovementKind.ADJUSTMENT, -5),
    ).toBe(false);
  });
});
