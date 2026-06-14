"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { getTileConfig } from "@/lib/routing/config";

/**
 * Round-18 — interactive route map on Leaflet + OpenStreetMap.
 *
 * Zero-config by design: OSM tiles need no token, so a fresh
 * deployment gets a real pannable/zoomable map instead of the old
 * "Mapbox token not configured" warning. Numbered pins use
 * L.divIcon (no image assets — Leaflet's default marker PNGs break
 * under bundlers anyway) and a dashed polyline traces the stop
 * order.
 *
 * Google Maps was evaluated and rejected for this deployment shape:
 * it requires an API key bound to a billing account, which is a
 * poor fit for self-hosted Unraid installs. Mapbox static tiles
 * remain an optional upgrade via NEXT_PUBLIC_MAPBOX_TOKEN.
 */

export interface MapStop {
  id: string;
  sequence: number;
  label: string;
  latitude: number;
  longitude: number;
}

export function LeafletMap({ stops }: { stops: MapStop[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let map: import("leaflet").Map | null = null;

    async function init() {
      if (!containerRef.current || stops.length === 0) return;
      const L = (await import("leaflet")).default;
      if (disposed || !containerRef.current) return;

      map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: false, // don't hijack page scroll on mobile
      });

      // Round-22 §3 — tiles are configurable (NEXT_PUBLIC_MAP_TILE_URL);
      // OSM is the zero-config default, but production points this at a
      // provider whose usage policy allows app traffic (see README).
      const tiles = getTileConfig();
      L.tileLayer(tiles.url, {
        maxZoom: 19,
        attribution: tiles.attribution,
      }).addTo(map);

      const latLngs: [number, number][] = stops.map((s) => [
        s.latitude,
        s.longitude,
      ]);

      // Round-22 §3 — spiderfy co-located stops. Several stops at the
      // same school share a lat/lng and used to stack into one pin;
      // fan duplicates out on a small circle so every stop is clickable.
      const seen = new Map<string, number>();
      for (const s of stops) {
        const key = `${s.latitude.toFixed(5)},${s.longitude.toFixed(5)}`;
        const dupIndex = seen.get(key) ?? 0;
        seen.set(key, dupIndex + 1);
        let lat = s.latitude;
        let lng = s.longitude;
        if (dupIndex > 0) {
          // ~12m offset ring; enough to separate pins at street zoom.
          const angle = (dupIndex * 60 * Math.PI) / 180;
          lat += 0.00011 * Math.cos(angle);
          lng += 0.00011 * Math.sin(angle);
        }
        L.marker([lat, lng], {
          icon: L.divIcon({
            className: "",
            html: `<div style="width:24px;height:24px;border-radius:9999px;background:#15583e;border:2px solid #fff;color:#fff;font:700 11px/20px system-ui;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.4)">${s.sequence}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
        })
          .addTo(map)
          .bindPopup(`<strong>${s.sequence}.</strong> ${escapeHtml(s.label)}`);
      }

      if (latLngs.length > 1) {
        L.polyline(latLngs, {
          color: "#15583e",
          weight: 3,
          dashArray: "6 6",
          opacity: 0.8,
        }).addTo(map);
        map.fitBounds(L.latLngBounds(latLngs), { padding: [28, 28] });
      } else {
        map.setView(latLngs[0]!, 15);
      }
    }

    void init();
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [stops]);

  return (
    <div
      ref={containerRef}
      data-testid="leaflet-map"
      className="relative z-0 overflow-hidden rounded border border-border bg-background"
      style={{ aspectRatio: "2 / 1", minHeight: 220 }}
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
