import type { NormalizedImportRow, NormalizedSchoolRow, NormalizedDeviceRow } from "./schema";

/**
 * Mapping from a superset of ServiceNow export column names to the canonical
 * field names used by the importer.
 *
 * Keys are lowercased and whitespace-normalized before lookup, so the actual
 * CSV header can be "Incident Number", "incident_number", "INCIDENT#", etc.
 */
const FIELD_ALIASES: Record<string, keyof NormalizedImportRow> = {
  // incidentNumber
  incidentnumber: "incidentNumber",
  incident: "incidentNumber",
  incidentid: "incidentNumber",
  number: "incidentNumber",
  ticketnumber: "incidentNumber",

  // sys id
  sysid: "serviceNowSysId",
  servicenowsysid: "serviceNowSysId",

  // reportedAt
  reportedat: "reportedAt",
  openedat: "reportedAt",
  created: "reportedAt",
  createdat: "reportedAt",
  opened: "reportedAt",

  // descriptions
  shortdescription: "shortDescription",
  subject: "shortDescription",
  summary: "shortDescription",
  description: "longDescription",
  details: "longDescription",
  longdescription: "longDescription",

  // priority
  priority: "priority",
  urgency: "priority",

  // school
  schoolcode: "schoolCode",
  locationcode: "schoolCode",
  dbn: "schoolCode",
  location: "schoolName",
  schoolname: "schoolName",
  site: "schoolName",

  // device
  serialnumber: "serialNumber",
  serial: "serialNumber",
  sn: "serialNumber",
  assettag: "assetTag",
  asset: "assetTag",
  manufacturer: "manufacturer",
  make: "manufacturer",
  modelname: "modelName",
  model: "modelName",

  // requester
  requestername: "requesterName",
  requestedfor: "requesterName",
  requester: "requesterName",
  requesteremail: "requesterEmail",
  email: "requesterEmail",

  // flags
  closed: "closedFlag",
  isclosed: "closedFlag",
  resolved: "closedFlag",

  notes: "notes",
  workernotes: "notes",
  comments: "notes",
};

const PRIORITY_ALIASES: Record<string, "LOW" | "NORMAL" | "HIGH" | "URGENT"> = {
  "1": "URGENT",
  "2": "HIGH",
  "3": "NORMAL",
  "4": "LOW",
  "5": "LOW",
  low: "LOW",
  moderate: "NORMAL",
  medium: "NORMAL",
  normal: "NORMAL",
  high: "HIGH",
  urgent: "URGENT",
  critical: "URGENT",
  "1-critical": "URGENT",
  "2-high": "HIGH",
  "3-moderate": "NORMAL",
  "4-low": "LOW",
};

function normalizeKey(key: string): string {
  return key
    .replace(/[\s_\-#.]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function normalizePriorityValue(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const v = String(raw).trim().toLowerCase();
  if (v === "") return undefined;
  // ServiceNow exports often use "3 - Moderate" with spaces around the
  // hyphen. Strip all whitespace before looking up the alias table so
  // those values line up with entries like "3-moderate".
  const compact = v.replace(/\s+/g, "");
  return (
    PRIORITY_ALIASES[v] ??
    PRIORITY_ALIASES[compact] ??
    compact.toUpperCase()
  );
}

/**
 * Reshape a single raw row (as parsed from CSV/XLSX) into the canonical
 * shape. Unknown columns are preserved in the _raw field on the result.
 */
export function mapRawRow(raw: Record<string, unknown>): {
  mapped: Partial<NormalizedImportRow> & { _extra: Record<string, unknown> };
} {
  const mapped: Partial<NormalizedImportRow> & {
    _extra: Record<string, unknown>;
  } = { _extra: {} };

  for (const [rawKey, value] of Object.entries(raw)) {
    if (value === "" || value == null) continue;
    const canonical = FIELD_ALIASES[normalizeKey(rawKey)];
    if (!canonical) {
      mapped._extra[rawKey] = value;
      continue;
    }
    if (canonical === "priority") {
      const p = normalizePriorityValue(value);
      if (p) mapped.priority = p as NormalizedImportRow["priority"];
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mapped as any)[canonical] = value;
  }

  return { mapped };
}

// ---------------------------------------------------------------------------
// School import mapper
// ---------------------------------------------------------------------------

const SCHOOL_FIELD_ALIASES: Record<string, keyof NormalizedSchoolRow> = {
  name: "name",
  schoolname: "name",
  school: "name",
  code: "code",
  schoolcode: "code",
  dbn: "code",
  locationcode: "code",
  district: "districtName",
  districtname: "districtName",
  address: "address",
  streetaddress: "address",
  street: "address",
  city: "city",
  state: "state",
  zip: "zip",
  zipcode: "zip",
  postalcode: "zip",
  phone: "phone",
  phonenumber: "phone",
  contactname: "contactName",
  contact: "contactName",
  contactemail: "contactEmail",
  email: "contactEmail",
};

export function mapRawSchoolRow(raw: Record<string, unknown>): {
  mapped: Partial<NormalizedSchoolRow> & { _extra: Record<string, unknown> };
} {
  const mapped: Partial<NormalizedSchoolRow> & {
    _extra: Record<string, unknown>;
  } = { _extra: {} };

  for (const [rawKey, value] of Object.entries(raw)) {
    if (value === "" || value == null) continue;
    const canonical = SCHOOL_FIELD_ALIASES[normalizeKey(rawKey)];
    if (!canonical) {
      mapped._extra[rawKey] = value;
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mapped as any)[canonical] = value;
  }

  return { mapped };
}

// ---------------------------------------------------------------------------
// Device import mapper
// ---------------------------------------------------------------------------

const DEVICE_FIELD_ALIASES: Record<string, keyof NormalizedDeviceRow> = {
  serialnumber: "serialNumber",
  serial: "serialNumber",
  sn: "serialNumber",
  assettag: "assetTag",
  asset: "assetTag",
  tag: "assetTag",
  manufacturer: "manufacturer",
  make: "manufacturer",
  brand: "manufacturer",
  modelname: "modelName",
  model: "modelName",
  schoolcode: "schoolCode",
  school: "schoolCode",
  dbn: "schoolCode",
  locationcode: "schoolCode",
  warrantyend: "warrantyEnd",
  warrantyexpiry: "warrantyEnd",
  warranty: "warrantyEnd",
  notes: "notes",
  comments: "notes",
};

export function mapRawDeviceRow(raw: Record<string, unknown>): {
  mapped: Partial<NormalizedDeviceRow> & { _extra: Record<string, unknown> };
} {
  const mapped: Partial<NormalizedDeviceRow> & {
    _extra: Record<string, unknown>;
  } = { _extra: {} };

  for (const [rawKey, value] of Object.entries(raw)) {
    if (value === "" || value == null) continue;
    const canonical = DEVICE_FIELD_ALIASES[normalizeKey(rawKey)];
    if (!canonical) {
      mapped._extra[rawKey] = value;
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mapped as any)[canonical] = value;
  }

  return { mapped };
}
