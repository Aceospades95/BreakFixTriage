"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

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

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      const latLngs: [number, number][] = stops.map((s) => [
        s.latitude,
        s.longitude,
      ]);

      for (const s of stops) {
        L.marker([s.latitude, s.longitude], {
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
