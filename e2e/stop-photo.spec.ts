import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-18 §4 — photo proof capture on a route stop.
 *
 * The PhotoCapture component drives a hidden
 * `<input type="file" accept="image/*" capture="environment">`:
 * on phones the rear camera opens directly, on desktop it's a file
 * picker. Either way the chosen image previews before saving and
 * submits through uploadAttachmentAction. The spec feeds the input
 * a 1×1 PNG buffer (Playwright can't drive a real camera) and
 * verifies preview → save → attachment listed.
 */

const prisma = new PrismaClient();

// Smallest valid PNG (1×1 transparent pixel).
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("§4 stop photo capture", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("take photo → preview → save attaches to the stop", async ({
    page,
  }) => {
    const route = await prisma.route.findFirst({
      where: { vehicleRef: "TEST-VAN-1" },
      select: { id: true },
    });
    expect(route, "TEST-VAN-1 fixture route missing").toBeTruthy();

    await signInAs(page, PERSONA.DRIVER);
    await page.goto(`/scheduling/routes/${route!.id}`);

    // The first active stop opens by default; its photo-capture
    // form is in the Photos & proof section.
    const capture = page.getByTestId("photo-capture").first();
    await expect(
      capture.getByRole("button", { name: /take photo/i }),
    ).toBeVisible();

    const stamp = Date.now();
    await capture.locator('input[name="file"]').setInputFiles({
      name: `proof-${stamp}.png`,
      mimeType: "image/png",
      buffer: PNG_1X1,
    });

    // Preview renders with retake + save controls before anything
    // is uploaded.
    await expect(capture.getByAltText(/preview of proof-/i)).toBeVisible();
    const save = capture.getByRole("button", { name: /save photo/i });
    await expect(save).toBeEnabled();
    await save.click();

    // After the redirect the attachment shows in the list with a
    // link to the stored file.
    await expect(
      page.getByRole("link", { name: `proof-${stamp}.png` }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
