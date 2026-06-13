import { JobStatus, ProofRule, StopLineState } from "@prisma/client";

/**
 * Round-22 §1C/§1D — pure, DB-free helpers for the stop completion
 * gate. Kept separate from the server action and the page so the gate
 * logic is unit-testable and the UI and the server compute the exact
 * same answer (the UI enables a button only when the server would
 * accept the submission).
 */

/** A line is "resolved" once the technician has acted on it. */
export function isLineResolved(state: StopLineState): boolean {
  return state !== StopLineState.EXPECTED;
}

/** A resolved line that counts as work done (cascades the ticket forward). */
export function isLineSuccessful(state: StopLineState): boolean {
  return (
    state === StopLineState.VERIFIED || state === StopLineState.EXTRA_ADDED
  );
}

/** A resolved line that did NOT complete (re-queues its ticket). */
export function isLineUnsuccessful(state: StopLineState): boolean {
  return state === StopLineState.NOT_FOUND || state === StopLineState.REFUSED;
}

export interface ProofPresence {
  photo: boolean;
  signature: boolean;
}

/**
 * Classify the proof attached to a stop. A signature is any attachment
 * with a signer name (the signature-pad path always sets one); a photo
 * is any other image attachment.
 */
export function proofPresence(
  attachments: { mimeType: string; signerName: string | null }[],
): ProofPresence {
  let photo = false;
  let signature = false;
  for (const a of attachments) {
    if (a.signerName) signature = true;
    else if (a.mimeType.startsWith("image/")) photo = true;
  }
  return { photo, signature };
}

/** Does the present proof satisfy the stop's proof rule? */
export function isProofSatisfied(
  rule: ProofRule,
  present: ProofPresence,
): boolean {
  switch (rule) {
    case ProofRule.NONE:
      return true;
    case ProofRule.PHOTO:
      return present.photo;
    case ProofRule.SIGNATURE:
      return present.signature;
    case ProofRule.PHOTO_AND_SIGNATURE:
      return present.photo && present.signature;
    default:
      return true;
  }
}

/** Human-readable description of what a proof rule demands. */
export function describeProofRule(rule: ProofRule): string {
  switch (rule) {
    case ProofRule.NONE:
      return "No proof required.";
    case ProofRule.PHOTO:
      return "Photo of the devices before completing.";
    case ProofRule.SIGNATURE:
      return "School-contact signature before completing.";
    case ProofRule.PHOTO_AND_SIGNATURE:
      return "Photo of the devices + school-contact signature before completing.";
    default:
      return "No proof required.";
  }
}

export interface GateLine {
  state: StopLineState;
}

export interface CompletionGateInput {
  /** Active (non-removed) line items on the stop. */
  lines: GateLine[];
  proofRule: ProofRule;
  proofPresent: ProofPresence;
  /** True when the technician supplied a substantive proof-override reason. */
  hasProofOverride: boolean;
}

export interface CompletionGate {
  allResolved: boolean;
  anySuccessful: boolean;
  anyUnsuccessful: boolean;
  proofSatisfied: boolean;
  proofOk: boolean;
  /** Complete is allowed (every line succeeded + proof OK). */
  canComplete: boolean;
  /** Partial is allowed (all resolved, a mix of success + failure). */
  canPartial: boolean;
  /** The outcome the UI should steer toward, or null if nothing is ready. */
  suggested: JobStatus | null;
  /** Why complete/partial is blocked, for the disabled-control hint. */
  blockedReason: string | null;
}

/**
 * The single source of truth for "can this stop be completed / partialled
 * right now, and which one?" Used by the server to ENFORCE and by the panel
 * to enable the right button with an honest reason when it's disabled.
 */
export function evaluateCompletionGate(
  input: CompletionGateInput,
): CompletionGate {
  const total = input.lines.length;
  const resolved = input.lines.filter((l) => isLineResolved(l.state)).length;
  const successful = input.lines.filter((l) =>
    isLineSuccessful(l.state),
  ).length;
  const unsuccessful = input.lines.filter((l) =>
    isLineUnsuccessful(l.state),
  ).length;

  const allResolved = total === 0 ? true : resolved === total;
  const anySuccessful = successful > 0;
  const anyUnsuccessful = unsuccessful > 0;
  const proofSatisfied = isProofSatisfied(input.proofRule, input.proofPresent);
  const proofOk = proofSatisfied || input.hasProofOverride;

  // A stop with zero line items (legacy route, or a non-device job) can be
  // completed once proof is OK — there is nothing to verify item by item.
  const everythingSucceeded =
    allResolved && !anyUnsuccessful && (total === 0 || anySuccessful);

  const canComplete = everythingSucceeded && proofOk;
  const canPartial =
    allResolved && anySuccessful && anyUnsuccessful && proofOk;

  let suggested: JobStatus | null = null;
  if (canComplete) suggested = JobStatus.COMPLETED;
  else if (canPartial) suggested = JobStatus.PARTIAL;

  let blockedReason: string | null = null;
  if (!allResolved) {
    const remaining = total - resolved;
    blockedReason = `Resolve every line first — ${remaining} still to check off.`;
  } else if (!anySuccessful && total > 0) {
    blockedReason =
      "Nothing was picked up or delivered — fail the stop with a reason instead.";
  } else if (!proofOk) {
    blockedReason =
      "Proof is required — capture it, or complete with an override reason.";
  }

  return {
    allResolved,
    anySuccessful,
    anyUnsuccessful,
    proofSatisfied,
    proofOk,
    canComplete,
    canPartial,
    suggested,
    blockedReason,
  };
}
