# Maps, photo proof, and signature capture

How the field-facing capture features work, what (if anything) you
must configure, and how to troubleshoot them. Everything here works
out of the box on a fresh deployment — the optional env vars only
upgrade behaviour.

## Route map

The route detail page (`/scheduling/routes/[routeId]`) renders an
interactive map of the stops.

**Decision (ADR-style summary).** The default map is
**Leaflet + OpenStreetMap tiles**: no token, no signup, no billing
account, which fits the self-hosted/Unraid deployment shape. Google
Maps was evaluated and rejected for display because a JS Maps key
must be bound to a billing account and locked to referrers — poor
fit for self-hosted installs. **Mapbox is an optional upgrade**, not
a requirement: the old "Mapbox token is not configured" warning was
wrong to treat a missing optional token as an error and has been
removed.

| Mode | When | What you get |
| ---- | ---- | ------------ |
| Leaflet + OpenStreetMap | default, zero config | interactive pan/zoom map, numbered stop pins, dashed route line |
| Mapbox static image | `NEXT_PUBLIC_MAPBOX_TOKEN` set | single static image request (no client JS), Mapbox imagery |

```bash
# optional — public token from https://account.mapbox.com
NEXT_PUBLIC_MAPBOX_TOKEN="pk.…"
```

Because `NEXT_PUBLIC_*` vars are inlined at build time, set it
**before** `npm run build` / the Docker image build.

### Route *optimization* is a separate concern

Stop sequencing uses `ROUTE_OPTIMIZER`:

```bash
ROUTE_OPTIMIZER="nearest-neighbor"   # default, built-in, offline
# or
ROUTE_OPTIMIZER="google-routes"
GOOGLE_ROUTES_API_KEY="…"            # Google Cloud project with Routes API enabled
```

If `google-routes` is selected but the key is missing or the call
fails, the app falls back to the built-in nearest-neighbor optimizer
rather than failing the route build.

### Troubleshooting: "the map is a gray/empty box"

1. **CSP** — the app's Content-Security-Policy must allow the tile
   hosts in `img-src`. `next.config.mjs` ships with
   `https://tile.openstreetmap.org https://*.tile.openstreetmap.org
   https://api.mapbox.com` already allowed. If you front the app
   with a reverse proxy that injects its own CSP, mirror those
   sources.
2. **No coordinates** — stops only appear when the school's address
   has `latitude`/`longitude`. The page says so explicitly when no
   stop has coordinates; fix the school address under
   Admin → Schools.
3. **Outbound network** — the *browser* (not the server) fetches
   tiles from `tile.openstreetmap.org`; client machines need
   internet access to that host.

## Photo proof

`PhotoCapture` (route stops, ticket detail, expense receipts) is an
`<input type="file" accept="image/*" capture="environment">`:

- On phones/tablets the rear camera opens directly; on desktop it's
  a normal file picker. There is **no getUserMedia permission
  dance** — this is the most reliable cross-device capture path and
  it degrades to upload automatically.
- The photo is previewed client-side before saving (retake without
  burning an upload), validated against the 25 MB limit on both
  sides, then stored on the attachments volume.

Requirements:

- `ATTACHMENTS_DIR` must point at a writable volume (checked by
  `/api/health`). Bind-mount it in Docker so uploads survive
  rebuilds.
- Mobile browsers only offer the camera on **HTTPS** origins (or
  `localhost`). If techs report "it only opens the gallery", the app
  is probably being served over plain HTTP — put it behind TLS.

Every upload writes an `Attachment` row plus an `AuditLog` entry
(`upload`), so proof is traceable to a user and timestamp.

## Signature capture

`SignaturePad` is a pointer-events canvas (finger / stylus / mouse).
On save the PNG goes through the same attachment pipeline with extra
metadata:

- **Signer's printed name — required.** A signature nobody can
  attribute is useless as proof. Stored on `Attachment.signerName`.
- **Note — optional** free text ("left with main office").
  Stored on `Attachment.note`.
- Timestamp and capturing user come from `createdAt` /
  `uploadedByUserId`.

The attachment list renders a "Signed by …" badge and the note, and
the audit log records a `signature-captured` action. No
configuration needed.

## Dev-mode note (CSP)

Next.js dev mode (`npm run dev`) evaluates HMR chunks through
`eval`. The CSP therefore includes `'unsafe-eval'` **in development
only** — production builds do not get it. If you ever see every
button on the site doing nothing in dev plus an `EvalError` in the
browser console, a proxy is probably re-injecting a stricter CSP.
