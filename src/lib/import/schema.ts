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

/**
 * Schema for school imports. Schools can be imported from a CSV with
 * columns for name, code, district, and address fields.
 */
export const NormalizedSchoolRow = z.object({
  name: z.string().trim().min(1, "name is required"),
  code: z.string().trim().min(1, "code is required"),
  districtName: z.string().trim().min(1, "districtName is required"),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  zip: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().email().optional().or(z.literal("")),
});

export type NormalizedSchoolRow = z.infer<typeof NormalizedSchoolRow>;

/**
 * Schema for device imports. Devices can be imported from a CSV with
 * columns for serial number, asset tag, model, and school assignment.
 */
export const NormalizedDeviceRow = z.object({
  serialNumber: z.string().trim().min(1, "serialNumber is required"),
  assetTag: z.string().trim().optional(),
  manufacturer: z.string().trim().optional(),
  modelName: z.string().trim().optional(),
  schoolCode: z.string().trim().min(1, "schoolCode is required"),
  warrantyEnd: z.coerce.date().optional(),
  notes: z.string().trim().optional(),
});

export type NormalizedDeviceRow = z.infer<typeof NormalizedDeviceRow>;
