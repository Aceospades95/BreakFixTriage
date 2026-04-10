import { z } from "zod";

/**
 * Canonical shape of a normalized import row. The importer accepts a wide
 * variety of ServiceNow column naming conventions and maps them onto this
 * shape before writing anything to the DB.
 */
export const NormalizedImportRow = z.object({
  incidentNumber: z
    .string()
    .trim()
    .min(1, "incidentNumber is required")
    .regex(/^[A-Z]{2,5}\d+$/i, "incidentNumber must look like INC1234567"),
  serviceNowSysId: z.string().trim().optional(),
  reportedAt: z.coerce.date(),
  shortDescription: z.string().trim().min(1, "shortDescription is required"),
  longDescription: z.string().trim().optional(),
  priority: z
    .enum(["LOW", "NORMAL", "HIGH", "URGENT"])
    .default("NORMAL"),
  schoolCode: z.string().trim().min(1, "schoolCode is required"),
  schoolName: z.string().trim().optional(),
  serialNumber: z.string().trim().optional(),
  assetTag: z.string().trim().optional(),
  manufacturer: z.string().trim().optional(),
  modelName: z.string().trim().optional(),
  requesterName: z.string().trim().optional(),
  requesterEmail: z.string().trim().email().optional().or(z.literal("")),
  closedFlag: z.coerce.boolean().optional(),
  notes: z.string().trim().optional(),
});

export type NormalizedImportRow = z.infer<typeof NormalizedImportRow>;
