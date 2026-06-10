import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-21 — signature capture on a route stop.
 *
 * The SignaturePad canvas snapshots a PNG into a hidden field on
 * pointer-up; the form additionally requires the signer's printed
 * name so the proof is attributable. The spec draws a stroke with
 * the mouse, fills the name, saves, and verifies the attachment
 * lists with the "Signed by" badge. The empty-canvas path must be
 * rejected server-side.
 */

const prisma = new PrismaClient();

test.describe("§R21 stop signature capture", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("draw → name → save shows a Signed-by attachment", async ({
    page,
  }) => {
    const route = await prisma.route.findFirst({
      where: { vehicleRef: "TEST-VAN-1" },
      select: { id: true },
    });
    expect(route, "TEST-VAN-1 fixture route missing").toBeTruthy();

    await signInAs(page, PERSONA.DRIVER);
    await page.goto(`/scheduling/routes/${route!.id}`);

    const canvas = page.locator('canvas[aria-label="Signature canvas"]').first();
    await expect(canvas).toBeVisible();
    // Mouse events address viewport coordinates — bring the pad on
    // screen before measuring, or the stroke lands below the fold.
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    // A two-segment stroke across the pad.
    await page.mouse.move(box!.x + 30, box!.y + 60);
    await page.mouse.down();
    await page.mouse.move(box!.x + 120, box!.y + 100, { steps: 8 });
    await page.mouse.move(box!.x + 220, box!.y + 50, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByText("Signed", { exact: true }).first()).toBeVisible();

    const signerName = `E2E Signer ${Date.now()}`;
    const form = page
      .locator("form", { has: page.locator('input[name="signatureDataUrl"]') })
      .first();
    await form.locator('input[name="signerName"]').fill(signerName);
    await form.locator('input[name="note"]').fill("left with main office");
    await form.getByRole("button", { name: /save signature/i }).click();

    // .first(): the success message renders as both the page banner
    // and the toast until the toast strips the query param.
    await expect(page.getByText(`Signed by ${signerName}`).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("left with main office").first()).toBeVisible();
  });

  test("empty canvas is rejected with a clear error", async ({ page }) => {
    const route = await prisma.route.findFirst({
      where: { vehicleRef: "TEST-VAN-1" },
      select: { id: true },
    });
    expect(route).toBeTruthy();

    await signInAs(page, PERSONA.DRIVER);
    await page.goto(`/scheduling/routes/${route!.id}`);

    const form = page
      .locator("form", { has: page.locator('input[name="signatureDataUrl"]') })
      .first();
    await expect(form).toBeVisible();
    await form.locator('input[name="signerName"]').fill("Nobody Signed");
    await form.getByRole("button", { name: /save signature/i }).click();

    // .first(): error banner + sticky error toast both carry it.
    await expect(
      page.getByText(/signature is empty/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
