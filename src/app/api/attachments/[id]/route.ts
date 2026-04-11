import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";
import { resolveStoredPath } from "@/lib/attachments/storage";

/**
 * Stream an attachment back to the browser. Every read is gated on
 * an authenticated session — we deliberately do not expose a public
 * signed URL because everything inside this app is private.
 *
 * Returns 401 for unauthenticated, 404 for missing, 500 for disk
 * errors. Sets Content-Disposition so the browser preserves the
 * original filename on download.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession();
  if (!session) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const attachment = await prisma.attachment.findUnique({
    where: { id: params.id },
  });
  if (!attachment) {
    return new NextResponse("not found", { status: 404 });
  }

  try {
    const absPath = resolveStoredPath(attachment.storedPath);
    const bytes = await readFile(absPath);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(attachment.sizeBytes),
        "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.filename)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return new NextResponse("file missing on disk", { status: 500 });
  }
}
