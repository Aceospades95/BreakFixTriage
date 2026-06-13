"use client";

import { LeafletMap } from "@/components/leaflet-map";

/**
 * Route map renderer.
 *
 * Two render paths:
 *   1. When `mapboxToken` is provided (caller passes
 *      `process.env.NEXT_PUBLIC_MAPBOX_TOKEN`), render a Mapbox
 *      static-tile image with numbered pins and a leg breakdown
 *      below. Single image request — no client-side JS bundle.
 *   2. Otherwise (the default), render an interactive Leaflet map
 *      on OpenStreetMap tiles — token-free, so a fresh deployment
 *      gets a real map with zero configuration. Round-18 replaced
 *      the old SVG fallback + "Mapbox token not configured" warning
 *      here: a missing optional token is not an error condition.
 *
 * No coordinates → "Add lat/lng to school addresses" empty state.
 */

interface Point {
  id: string;
  sequence: number;
  label: string;
  sublabel?: string;
  latitude: number | null;
  longitude: number | null;
}

/** Serializable road-route data passed from a server component. */
export interface RoadRouteData {
  legs: { distanceKm: number; durationMin: number }[];
  totalKm: number;
  totalMin: number;
}

export function RouteMap({
  stops,
  title = "Route map",
  mapboxToken,
  roadRoute = null,
}: {
  stops: Point[];
  title?: string;
  mapboxToken?: string | null;
  /**
   * Real road geometry + drive times when a routing provider is
   * configured (server passes it). Null → straight-line approximation,
   * explicitly labeled, with no duration claims.
   */
  roadRoute?: RoadRouteData | null;
}) {
  const withCoords = stops.filter(
    (s): s is Point & { latitude: number; longitude: number } =>
      s.latitude != null && s.longitude != null,
  );

  if (withCoords.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {title}
        </div>
        No coordinates on these stops yet. Add lat/lng to school addresses
        to unlock the map and auto-optimized routing.
      </div>
    );
  }

  // Compute total distance across visits (in order).
  let totalKm = 0;
  for (let i = 1; i < withCoords.length; i++) {
    const a = withCoords[i - 1]!;
    const b = withCoords[i]!;
    totalKm += haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
  }

  const mapboxUrl = mapboxToken
    ? buildMapboxStaticUrl(withCoords, mapboxToken)
    : null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold tracking-wide text-slate-300">
          {title}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {withCoords.length} stop{withCoords.length === 1 ? "" : "s"}
          </span>
          {roadRoute ? (
            <span className="tabular-nums">
              {roadRoute.totalKm.toFixed(1)} km · ~{Math.round(roadRoute.totalMin)} min
              by road
            </span>
          ) : (
            <span className="tabular-nums">
              {totalKm.toFixed(1)} km · {(totalKm * 0.621).toFixed(1)} mi
              (straight-line)
            </span>
          )}
        </div>
      </div>
      {!roadRoute && withCoords.length > 1 && (
        <p className="mb-2 text-[10px] text-amber-300/80">
          Straight-line approximation — road routing not configured. Distances
          are as-the-crow-flies and no drive times are shown.
        </p>
      )}
      {mapboxUrl ? (
        <div
          className="relative overflow-hidden rounded border border-border bg-background"
          style={{ aspectRatio: "2 / 1" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mapboxUrl}
            alt={`Map with ${withCoords.length} stops`}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      ) : (
        <LeafletMap
          stops={withCoords.map((s) => ({
            id: s.id,
            sequence: s.sequence,
            label: s.label,
            latitude: s.latitude,
            longitude: s.longitude,
          }))}
        />
      )}

      {/* Leg breakdown */}
      {withCoords.length > 1 && (
        <div className="mt-3 space-y-1 text-xs">
          {withCoords.map((s, i) => {
            if (i === 0) {
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-2 text-muted-foreground"
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                    {s.sequence}
                  </span>
                  <span className="text-slate-200">{s.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    start
                  </span>
                </div>
              );
            }
            const prev = withCoords[i - 1]!;
            const roadLeg = roadRoute?.legs[i - 1];
            const leg = haversineKm(
              prev.latitude,
              prev.longitude,
              s.latitude,
              s.longitude,
            );
            return (
              <div
                key={s.id}
                className="flex items-center gap-2 text-muted-foreground"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                  {s.sequence}
                </span>
                <span className="text-slate-200">{s.label}</span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {roadLeg
                    ? `+${roadLeg.distanceKm.toFixed(1)} km · ${Math.round(roadLeg.durationMin)} min`
                    : `+${leg.toFixed(1)} km`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function buildMapboxStaticUrl(
  stops: Array<{ sequence: number; latitude: number; longitude: number }>,
  token: string,
): string {
  const overlay = stops
    .slice(0, 12)
    .map(
      (s) =>
        `pin-s-${s.sequence}+f97316(${s.longitude.toFixed(
          5,
        )},${s.latitude.toFixed(5)})`,
    )
    .join(",");
  const auto = "auto";
  const size = "640x320@2x";
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${overlay}/${auto}/${size}?access_token=${encodeURIComponent(
    token,
  )}`;
}
