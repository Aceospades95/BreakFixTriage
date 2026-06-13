import { describe, expect, it } from "vitest";
import { JobStatus, ProofRule, StopLineState } from "@prisma/client";
import {
  evaluateCompletionGate,
  isProofSatisfied,
  proofPresence,
} from "@/lib/scheduling/stop-lines";

/**
 * Round-22 §1D — the completion gate is the single source of truth for
 * "can this stop complete / partial right now, and which one?" Both the
 * server (enforce) and the on-site panel (enable the right button) call
 * it, so its behaviour is pinned here.
 */

const bothProof = { photo: true, signature: true };
const noProof = { photo: false, signature: false };

describe("proof helpers", () => {
  it("classifies attachments into photo vs signature", () => {
    const present = proofPresence([
      { mimeType: "image/png", signerName: null },
      { mimeType: "image/png", signerName: "Front desk" },
    ]);
    expect(present).toEqual({ photo: true, signature: true });
  });

  it("evaluates each proof rule against what's present", () => {
    expect(isProofSatisfied(ProofRule.NONE, noProof)).toBe(true);
    expect(isProofSatisfied(ProofRule.PHOTO, { photo: true, signature: false })).toBe(true);
    expect(isProofSatisfied(ProofRule.PHOTO, noProof)).toBe(false);
    expect(isProofSatisfied(ProofRule.SIGNATURE, { photo: false, signature: true })).toBe(true);
    expect(isProofSatisfied(ProofRule.PHOTO_AND_SIGNATURE, { photo: true, signature: false })).toBe(false);
    expect(isProofSatisfied(ProofRule.PHOTO_AND_SIGNATURE, bothProof)).toBe(true);
  });
});

describe("evaluateCompletionGate", () => {
  it("allows Complete when every line is verified and proof is satisfied", () => {
    const gate = evaluateCompletionGate({
      lines: [
        { state: StopLineState.VERIFIED },
        { state: StopLineState.EXTRA_ADDED },
      ],
      proofRule: ProofRule.PHOTO_AND_SIGNATURE,
      proofPresent: bothProof,
      hasProofOverride: false,
    });
    expect(gate.canComplete).toBe(true);
    expect(gate.canPartial).toBe(false);
    expect(gate.suggested).toBe(JobStatus.COMPLETED);
  });

  it("blocks Complete until every line is resolved", () => {
    const gate = evaluateCompletionGate({
      lines: [
        { state: StopLineState.VERIFIED },
        { state: StopLineState.EXPECTED },
      ],
      proofRule: ProofRule.NONE,
      proofPresent: noProof,
      hasProofOverride: false,
    });
    expect(gate.canComplete).toBe(false);
    expect(gate.canPartial).toBe(false);
    expect(gate.blockedReason).toMatch(/Resolve every line/);
  });

  it("offers Partial when resolutions are mixed", () => {
    const gate = evaluateCompletionGate({
      lines: [
        { state: StopLineState.VERIFIED },
        { state: StopLineState.NOT_FOUND },
      ],
      proofRule: ProofRule.NONE,
      proofPresent: noProof,
      hasProofOverride: false,
    });
    expect(gate.canComplete).toBe(false);
    expect(gate.canPartial).toBe(true);
    expect(gate.suggested).toBe(JobStatus.PARTIAL);
  });

  it("blocks completion when proof is required but missing", () => {
    const gate = evaluateCompletionGate({
      lines: [{ state: StopLineState.VERIFIED }],
      proofRule: ProofRule.PHOTO_AND_SIGNATURE,
      proofPresent: noProof,
      hasProofOverride: false,
    });
    expect(gate.canComplete).toBe(false);
    expect(gate.proofSatisfied).toBe(false);
    expect(gate.blockedReason).toMatch(/Proof is required/);
  });

  it("an override reason unlocks completion past an unmet proof rule", () => {
    const gate = evaluateCompletionGate({
      lines: [{ state: StopLineState.VERIFIED }],
      proofRule: ProofRule.PHOTO_AND_SIGNATURE,
      proofPresent: noProof,
      hasProofOverride: true,
    });
    expect(gate.proofSatisfied).toBe(false);
    expect(gate.proofOk).toBe(true);
    expect(gate.canComplete).toBe(true);
  });

  it("won't Partial when nothing succeeded — that's a Fail", () => {
    const gate = evaluateCompletionGate({
      lines: [
        { state: StopLineState.NOT_FOUND },
        { state: StopLineState.REFUSED },
      ],
      proofRule: ProofRule.NONE,
      proofPresent: noProof,
      hasProofOverride: false,
    });
    expect(gate.canComplete).toBe(false);
    expect(gate.canPartial).toBe(false);
  });

  it("a stop with no line items completes once proof is OK", () => {
    const gate = evaluateCompletionGate({
      lines: [],
      proofRule: ProofRule.PHOTO,
      proofPresent: { photo: true, signature: false },
      hasProofOverride: false,
    });
    expect(gate.canComplete).toBe(true);
  });
});
