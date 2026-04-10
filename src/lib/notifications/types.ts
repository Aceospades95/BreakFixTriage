/**
 * Shared types for notification transports. Split out of transport.ts so
 * that individual transport modules can import the interface without
 * pulling in the module-level cache or the Prisma client.
 */

export interface TransportResult {
  ok: boolean;
  error?: string;
}

export interface NotificationTransport {
  readonly name: string;
  send(input: {
    recipientEmail: string;
    subject: string;
    body: string;
  }): Promise<TransportResult>;
}
