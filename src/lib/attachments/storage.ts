/**
 * Local-volume attachment storage.
 *
 * Attachments live on the app container's local filesystem under
 * `ATTACHMENTS_DIR` (default `/app/data/attachments`). On Unraid this
 * is bind-mounted to a share so files survive container rebuilds.
 *
 * We intentionally do NOT use cloud storage in Phase 6 — adding S3
 * would be another env var, another dep, another failure mode. A
 * local volume is good enough for a single-site break-fix operation
 * and can be swapped for S3 later behind the same API.
 */

import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  MAX_ATTACHMENT_BYTES,
  buildStoredPath,
  validateMimeType,
  validateSize,
} from "./validation";

export function attachmentsRoot(): string {
  return process.env.ATTACHMENTS_DIR ?? "/app/data/attachments";
}

export interface StoredFile {
  id: string;
  filename: string;
  storedPath: string;
  absolutePath: string;
  mimeType: string;
  sizeBytes: number;
}

export interface StoreFileInput {
  /** Original filename from the browser. */
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

/**
 * Write a file to the attachments volume. Validates mime and size
 * before touching the filesystem, and returns the metadata the
 * caller needs to persist into the Attachment row.
 */
export async function storeFile(input: StoreFileInput): Promise<StoredFile> {
  const mimeCheck = validateMimeType(input.mimeType);
  if (!mimeCheck.ok) throw new Error(mimeCheck.reason);
  const sizeCheck = validateSize(input.bytes.length);
  if (!sizeCheck.ok) throw new Error(sizeCheck.reason);

  const id = randomUUID();
  const relPath = buildStoredPath(id, input.filename, new Date());
  const absPath = path.join(attachmentsRoot(), relPath);

  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, input.bytes);

  return {
    id,
    filename: input.filename,
    storedPath: relPath,
    absolutePath: absPath,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.length,
  };
}

/**
 * Delete a previously-stored file. Idempotent: missing files are not
 * an error so the caller can safely delete both the DB row and the
 * blob without worrying about order.
 */
export async function deleteStoredFile(storedPath: string): Promise<void> {
  if (!storedPath) return;
  // Refuse anything that tries to escape the root — defense in depth,
  // since validate/sanitize should already have prevented this.
  if (storedPath.includes("..")) {
    throw new Error("storedPath traversal refused");
  }
  const absPath = path.join(attachmentsRoot(), storedPath);
  try {
    await rm(absPath, { force: true });
  } catch {
    // Best-effort — the blob may have been cleaned up already.
  }
}

/**
 * Resolve a stored relative path to an absolute path usable by a
 * read stream. Validates against path traversal.
 */
export function resolveStoredPath(storedPath: string): string {
  if (!storedPath || storedPath.includes("..")) {
    throw new Error("invalid stored path");
  }
  return path.join(attachmentsRoot(), storedPath);
}

export { MAX_ATTACHMENT_BYTES };
