"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Round-18 §4 — "Take photo" proof capture for route stops and
 * tickets.
 *
 * `<input capture="environment">` opens the rear camera directly on
 * phones/tablets and falls back to a normal file picker on desktop —
 * no getUserMedia permission dance, no upload library. The photo is
 * previewed before saving so a blurry shot can be retaken without
 * burning an upload, then submits through the regular
 * uploadAttachmentAction multipart form (server-side size/type
 * validation + audit + error banner on the redirect already exist
 * on that path).
 */
export function PhotoCapture({
  action,
  ownerKind,
  ownerId,
  returnTo,
}: {
  action: (formData: FormData) => Promise<void> | void;
  ownerKind: "TICKET" | "ROUTE_STOP" | "QUOTE";
  ownerId: string;
  returnTo: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [oversize, setOversize] = useState(false);

  const ownerIdField =
    ownerKind === "TICKET"
      ? "ticketId"
      : ownerKind === "ROUTE_STOP"
        ? "routeStopId"
        : "quoteId";

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (preview) URL.revokeObjectURL(preview);
    if (!file) {
      setPreview(null);
      setFilename("");
      setOversize(false);
      return;
    }
    setPreview(URL.createObjectURL(file));
    setFilename(file.name);
    // Mirror MAX_ATTACHMENT_BYTES (25 MB) client-side so the user
    // hears about an oversize photo before the round trip.
    setOversize(file.size > 25 * 1024 * 1024);
  }

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFilename("");
    setOversize(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <form action={action} encType="multipart/form-data" data-testid="photo-capture">
      <input type="hidden" name="kind" value={ownerKind} />
      <input type="hidden" name={ownerIdField} value={ownerId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input
        ref={inputRef}
        type="file"
        name="file"
        accept="image/*"
        capture="environment"
        onChange={onPick}
        className="sr-only"
        aria-label="Take or choose a photo"
      />
      {!preview ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/20"
        >
          📷 Take photo
        </button>
      ) : (
        <div className="space-y-2 rounded border border-surface-border bg-surface p-2">
          {/* Blob preview URL — next/image can't optimize object URLs. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={`Preview of ${filename}`}
            className="max-h-48 rounded object-contain"
          />
          <div className="text-xs text-slate-400">{filename}</div>
          {oversize && (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-200">
              This photo is over the 25 MB limit — please retake it at a
              lower resolution.
            </div>
          )}
          <div className="flex gap-2">
            <SaveButton disabled={oversize} />
            <button
              type="button"
              onClick={reset}
              className="rounded border border-surface-border px-3 py-1.5 text-xs text-slate-300 hover:border-accent hover:text-white"
            >
              Retake
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded bg-accent px-3 py-1.5 text-xs font-semibold hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save photo"}
    </button>
  );
}
