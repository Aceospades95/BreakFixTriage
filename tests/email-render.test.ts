import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  renderString,
  validateVariables,
} from "@/lib/email/render";

/**
 * Round-2 §3/§4 — template render contract.
 *
 * The render module is intentionally minimal Mustache-flavoured
 * substitution. These tests pin the exact subset of behaviour the
 * pre-seeded templates depend on; anything more complex needs a
 * design conversation (loops, partials).
 */

describe("renderString — variable substitution", () => {
  it("replaces a top-level path", () => {
    expect(renderString("Hi {{name}}", { name: "Alex" })).toBe("Hi Alex");
  });

  it("replaces a nested path", () => {
    expect(
      renderString("Ticket {{ticket.number}}", {
        ticket: { number: "INC1000003" },
      }),
    ).toBe("Ticket INC1000003");
  });

  it("renders missing paths as empty string", () => {
    expect(renderString("Hi {{name}}", {})).toBe("Hi ");
  });

  it("HTML-escapes substituted values", () => {
    expect(
      renderString("Note: {{n}}", { n: "<script>alert(1)</script>" }),
    ).toBe(
      "Note: &lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("preserves the literal template body", () => {
    expect(renderString("<p>Hello</p>", {})).toBe("<p>Hello</p>");
  });
});

describe("renderString — sections", () => {
  it("renders a section block when the value is truthy", () => {
    expect(
      renderString(
        "{{# reason }}Reason: {{reason}}{{/ reason }}",
        { reason: "needs parts" },
      ),
    ).toBe("Reason: needs parts");
  });

  it("hides a section block when the value is falsy", () => {
    for (const v of [null, undefined, false, "", 0, []]) {
      expect(
        renderString(
          "{{# reason }}Reason: {{reason}}{{/ reason }}",
          { reason: v },
        ),
      ).toBe("");
    }
  });

  it("nested-path sections work", () => {
    expect(
      renderString(
        "{{# ticket.assignee }}Assigned to {{ticket.assignee.name}}{{/ ticket.assignee }}",
        { ticket: { assignee: { name: "Tess" } } },
      ),
    ).toBe("Assigned to Tess");
  });
});

describe("renderTemplate — three-string output", () => {
  it("renders subject, html, text consistently", () => {
    const out = renderTemplate({
      subject: "Ticket {{ticket.number}}",
      bodyHtml: "<p>{{ticket.summary}}</p>",
      bodyText: "{{ticket.summary}}",
      variables: { ticket: { number: "INC1", summary: "broken screen" } },
    });
    expect(out.subject).toBe("Ticket INC1");
    expect(out.bodyHtml).toBe("<p>broken screen</p>");
    expect(out.bodyText).toBe("broken screen");
  });
});

describe("validateVariables", () => {
  it("returns ok when no required keys are declared", () => {
    expect(validateVariables({}, { a: 1 })).toEqual({ ok: true });
  });

  it("returns ok when every required key is present", () => {
    expect(
      validateVariables(
        { type: "object", required: ["ticket", "link"] },
        { ticket: {}, link: "x" },
      ),
    ).toEqual({ ok: true });
  });

  it("returns missing list when a required key is absent", () => {
    const result = validateVariables(
      { type: "object", required: ["ticket", "link"] },
      { ticket: {} },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual(["link"]);
    }
  });
});
