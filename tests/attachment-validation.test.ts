import { describe, it, expect } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  buildStoredPath,
  sanitizeFilename,
  validateMimeType,
  validateSize,
} from "@/lib/attachments/validation";

describe("validateMimeType", () => {
  it("accepts every allowlisted mime type", () => {
    for (const mime of ALLOWED_MIME_TYPES) {
      expect(validateMimeType(mime).ok).toBe(true);
    }
  });

  it("accepts mime types with uppercase variants", () => {
    expect(validateMimeType("IMAGE/JPEG").ok).toBe(true);
  });

  it("rejects non-allowlisted types", () => {
    expect(validateMimeType("application/x-msdownload").ok).toBe(false);
    expect(validateMimeType("text/html").ok).toBe(false);
  });

  it("rejects empty mime strings", () => {
    expect(validateMimeType("").ok).toBe(false);
  });
});

describe("validateSize", () => {
  it("accepts reasonable sizes", () => {
    expect(validateSize(1024).ok).toBe(true);
    expect(validateSize(MAX_ATTACHMENT_BYTES).ok).toBe(true);
  });

  it("rejects empty files", () => {
    expect(validateSize(0).ok).toBe(false);
  });

  it("rejects files over the limit", () => {
    expect(validateSize(MAX_ATTACHMENT_BYTES + 1).ok).toBe(false);
  });

  it("rejects negative or NaN sizes", () => {
    expect(validateSize(-1).ok).toBe(false);
    expect(validateSize(Number.NaN).ok).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it("passes a clean filename through unchanged", () => {
    expect(sanitizeFilename("damage.jpg")).toBe("damage.jpg");
  });

  it("strips directory separators", () => {
    // Slashes are deleted; remaining path parts get concatenated. The
    // leading dots get stripped too, so we're left with a flat safe
    // filename.
    expect(sanitizeFilename("../evil/payload.png")).toBe("evilpayload.png");
    expect(sanitizeFilename("foo\\bar.pdf")).toBe("foobar.pdf");
  });

  it("replaces whitespace and control chars with underscores", () => {
    expect(sanitizeFilename("my photo.jpg")).toBe("my_photo.jpg");
    expect(sanitizeFilename("bad\tname.pdf")).toBe("bad_name.pdf");
  });

  it("strips characters outside the safe alphabet", () => {
    expect(sanitizeFilename("hi!@#.jpg")).toBe("hi.jpg");
  });

  it("lowercases the extension", () => {
    expect(sanitizeFilename("REPORT.PDF")).toBe("REPORT.pdf");
  });

  it("caps the base name at 80 characters", () => {
    const longName = "a".repeat(200) + ".jpg";
    const result = sanitizeFilename(longName);
    expect(result.length).toBeLessThanOrEqual(84); // 80 + ".jpg"
    expect(result.endsWith(".jpg")).toBe(true);
  });

  it("falls back to 'file' when nothing survives", () => {
    expect(sanitizeFilename("   ")).toBe("file");
    expect(sanitizeFilename("!@#$%")).toBe("file");
  });
});

describe("buildStoredPath", () => {
  it("builds a year/month/id-name path", () => {
    const path = buildStoredPath(
      "abc-123",
      "photo.jpg",
      new Date("2026-05-17T10:00:00Z"),
    );
    expect(path).toBe("2026/05/abc-123-photo.jpg");
  });

  it("zero-pads the month", () => {
    const path = buildStoredPath(
      "id",
      "file.pdf",
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(path).toBe("2026/01/id-file.pdf");
  });

  it("sanitizes the filename part", () => {
    const path = buildStoredPath(
      "id",
      "../bad name.jpg",
      new Date("2026-06-15T00:00:00Z"),
    );
    expect(path).toBe("2026/06/id-bad_name.jpg");
  });
});
