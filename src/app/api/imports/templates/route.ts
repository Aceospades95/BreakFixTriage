import { NextRequest, NextResponse } from "next/server";

const TEMPLATES: Record<string, { filename: string; headers: string[]; sampleRows: string[][] }> = {
  tickets: {
    filename: "ticket-import-template.csv",
    headers: [
      "Incident Number",
      "Short Description",
      "School Code",
      "Opened At",
      "Serial Number",
      "Asset Tag",
      "Manufacturer",
      "Model",
      "Priority",
      "Description",
      "Requested For",
    ],
    sampleRows: [
      ["INC0012345", "Broken screen on student Chromebook", "K001", "2025-01-15", "SN-ABC-123", "AT-456", "Lenovo", "100e Gen 4", "NORMAL", "Screen cracked in upper left corner", "Jane Smith"],
      ["INC0012346", "Keyboard not working", "K002", "2025-01-16", "SN-DEF-789", "", "HP", "Chromebook 11 G9", "LOW", "Multiple keys unresponsive", ""],
    ],
  },
  schools: {
    filename: "school-import-template.csv",
    headers: [
      "Name",
      "Code",
      "District Name",
      "Address",
      "City",
      "State",
      "Zip",
      "Phone",
      "Contact Name",
      "Contact Email",
    ],
    sampleRows: [
      ["Lincoln Elementary", "K001", "District 1", "123 Main St", "New York", "NY", "10001", "212-555-0100", "John Principal", "jprincipal@d1.edu"],
      ["Washington Middle School", "K002", "District 1", "456 Oak Ave", "New York", "NY", "10002", "212-555-0200", "Mary Dean", "mdean@d1.edu"],
    ],
  },
  devices: {
    filename: "device-import-template.csv",
    headers: [
      "Serial Number",
      "Asset Tag",
      "Manufacturer",
      "Model",
      "School Code",
      "Warranty End",
      "Notes",
    ],
    sampleRows: [
      ["SN-ABC-123", "AT-456", "Lenovo", "100e Gen 4", "K001", "2026-08-15", "Student Chromebook"],
      ["SN-DEF-789", "", "HP", "Chromebook 11 G9", "K002", "2026-12-01", ""],
    ],
  },
  users: {
    filename: "user-import-template.csv",
    headers: ["Name", "Email", "Role", "Password"],
    sampleRows: [
      ["Jane Smith", "jane@example.com", "TECHNICIAN", "changeme123"],
      ["Bob Driver", "bob@example.com", "DRIVER", ""],
    ],
  },
  parts: {
    filename: "part-import-template.csv",
    headers: ["SKU", "Name", "Cost", "Stock Qty", "Min Stock Qty", "Manufacturer", "Model", "Notes"],
    sampleRows: [
      ["SCR-LCD-11", "11\" LCD Screen Assembly", "89.99", "25", "5", "Lenovo", "100e Gen 4", "OEM replacement"],
      ["KB-HP-G9", "Keyboard HP G9", "34.50", "10", "3", "HP", "Chromebook 11 G9", ""],
    ],
  },
  device_models: {
    filename: "device-model-import-template.csv",
    headers: ["Manufacturer", "Model Name", "Form Factor", "Warranty Months", "Repair Notes"],
    sampleRows: [
      ["Lenovo", "100e Gen 4", "CHROMEBOOK", "12", "Easy to open, screws on bottom"],
      ["HP", "Chromebook 11 G9", "CHROMEBOOK", "24", "Ribbon cable fragile"],
    ],
  },
};

function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  const template = type ? TEMPLATES[type] : null;

  if (!template) {
    return NextResponse.json(
      { error: `Unknown template type. Use: ${Object.keys(TEMPLATES).join(", ")}` },
      { status: 400 },
    );
  }

  const lines = [
    template.headers.map(escapeCsvField).join(","),
    ...template.sampleRows.map((row) => row.map(escapeCsvField).join(",")),
  ];
  const csv = lines.join("\r\n") + "\r\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${template.filename}"`,
    },
  });
}
