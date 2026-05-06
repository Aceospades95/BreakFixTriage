/**
 * Round-2 §3 — public surface of the email-rules engine.
 *
 * Callers should import from `@/lib/email` rather than reaching
 * into individual files; `send.ts` is the authoritative entry-
 * point and the others are implementation detail (recipients,
 * render, queue, provider).
 */

export {
  dispatchEmailEvent,
  processEmailJob,
  type DispatchContext,
} from "./send";
export { renderTemplate, validateVariables } from "./render";
export {
  resolveRecipients,
  isRecipientSet,
  type Recipient,
  type RecipientKind,
  type RecipientSet,
  type RecipientContext,
} from "./recipients";
export { enqueue, claim, complete, fail } from "./queue";
export {
  getEmailProvider,
  resetEmailProviderCache,
  type EmailProvider,
  type EmailMessage,
} from "./provider";
