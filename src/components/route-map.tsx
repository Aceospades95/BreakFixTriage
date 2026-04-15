"use client";

/**
 * Simple SVG route map.
 *
 * Renders plotted stop pins (numbered by sequence) on a normalized
 * coordinate grid, connected by a polyline in visit order. Total
 * distance is computed via haversine between consecutive stops.
 *
 * Zero external dependencies — just SVG + math. Good enough to give
 * dispatchers a "map feel" without pulling in Leaflet/Mapbox. A
 * follow-up change can swap in a real tile map when we're ready to
 * handle API keys and rate limiting.
 */

interface Point {
  id: string;
  sequence: number;
  label: string;
  sublabel?: string;
  latitude: number | null;
  longitude: number | null;
}

export function RouteMap({
  stops,
  title = "Route map",
}: {
  stops: Point[];
  title?: string;
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

  // Normalize lat/lng onto a 0..100 box. Note: lat flips (north = top).
  const lats = withCoords.map((s) => s.latitude);
  const lngs = withCoords.map((s) => s.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // Pad a bit so pins don't touch the edges.
  const padLat = Math.max((maxLat - minLat) * 0.1, 0.001);
  const padLng = Math.max((maxLng - minLng) * 0.1, 0.001);
  const loLat = minLat - padLat;
  const hiLat = maxLat + padLat;
  const loLng = minLng - padLng;
  const hiLng = maxLng + padLng;

  function project(lat: number, lng: number): { x: number; y: number } {
    const x = ((lng - loLng) / (hiLng - loLng)) * 100;
    const y = 100 - ((lat - loLat) / (hiLat - loLat)) * 100;
    return { x, y };
  }

  const points = withCoords.map((s) => ({ ...s, ...project(s.latitude, s.longitude) }));

  // Compute total distance across visits (in order).
  let totalKm = 0;
  for (let i = 1; i < withCoords.length; i++) {
    const a = withCoords[i - 1]!;
    const b = withCoords[i]!;
    totalKm += haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
  }

  const path = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {title}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {withCoords.length} stops
          </span>
          <span className="tabular-nums">
            {totalKm.toFixed(1)} km total
          </span>
          <span className="tabular-nums">
            ≈ {(totalKm * 0.621).toFixed(1)} mi
          </span>
        </div>
      </div>
      <div
        className="relative overflow-hidden rounded border border-border bg-background"
        style={{ aspectRatio: "2 / 1" }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          {/* Subtle grid */}
          {Array.from({ length: 9 }).map((_, i) => (
            <g key={i} stroke="currentColor" className="text-border/30">
              <line
                x1={((i + 1) * 10).toString()}
                y1="0"
                x2={((i + 1) * 10).toString()}
                y2="100"
                strokeWidth="0.1"
              />
              <line
                x1="0"
                y1={((i + 1) * 10).toString()}
                x2="100"
                y2={((i + 1) * 10).toString()}
                strokeWidth="0.1"
              />
            </g>
          ))}

          {/* Path */}
          {points.length > 1 && (
            <polyline
              points={path}
              fill="none"
              stroke="rgb(var(--color-primary))"
              strokeWidth="0.5"
              strokeDasharray="1 1"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Pins */}
          {points.map((p) => (
            <g key={p.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r="2.2"
                fill="rgb(var(--color-primary))"
                stroke="white"
                strokeWidth="0.4"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={p.x}
                y={p.y + 0.8}
                textAnchor="middle"
                className="fill-white"
                style={{ fontSize: "2.6px", fontWeight: 700 }}
              >
                {p.sequence}
              </text>
            </g>
          ))}
        </svg>
      </div>

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
                  +{leg.toFixed(1)} km
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
