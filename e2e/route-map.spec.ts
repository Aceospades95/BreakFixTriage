import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signInAs, PERSONA } from "./lib/sign-in-as";

/**
 * Round-18 §5 — route map regression.
 *
 * The map must work with zero configuration: Leaflet + OpenStreetMap
 * tiles, no token. The old behaviour showed an amber "Mapbox token
 * not configured" warning over an SVG fallback in every normal
 * deployment — a config error surfaced for a non-error. This spec
 * pins the fix: the interactive map container renders on a route
 * whose schools have coordinates, and the warning text is gone.
 */

const prisma = new PrismaClient();

test.describe("§5 route map", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("route detail renders Leaflet map without token warnings", async ({
    page,
  }) => {
    const route = await prisma.route.findFirst({
      where: { vehicleRef: "TEST-VAN-1" },
      select: { id: true },
    });
    expect(route, "TEST-VAN-1 fixture route missing").toBeTruthy();

    await signInAs(page, PERSONA.DISPATCHER);
    await page.goto(`/scheduling/routes/${route!.id}`);

    // The interactive map mounts client-side after the leaflet
    // dynamic import resolves.
    const map = page.getByTestId("leaflet-map");
    await expect(map).toBeVisible({ timeout: 15_000 });

    // Leaflet initialised: numbered stop pins + the OSM attribution
    // footer exist inside the container.
    await expect(
      map.locator(".leaflet-marker-icon").first(),
    ).toBeAttached({ timeout: 15_000 });
    await expect(map.locator(".leaflet-control-attribution")).toContainText(
      "OpenStreetMap",
    );

    // The misconfiguration banner is gone for good.
    await expect(page.getByText(/mapbox token not configured/i)).toHaveCount(
      0,
    );
  });
});
