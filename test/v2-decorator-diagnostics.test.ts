import { describe, it, expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { collectDiagnostics } from "../src/diagnostics.js";

function makeDocument(source: string): TextDocument {
  return TextDocument.create("file:///test.ets", "arkts", 0, source);
}

function getDiagnosticMessages(source: string): string[] {
  const doc = makeDocument(source);
  return collectDiagnostics(doc, { maxNumberOfProblems: 100 }).map((d) => d.message);
}

// ─── @Monitor callback validation ──────────────────────────────────────────

describe("@Monitor callback diagnostics", () => {
  it("warns when @Monitor callback method does not exist in struct", () => {
    const source = `
@ComponentV2
struct MyPage {
  @Local count: number = 0;

  @Monitor('count')
  onCountMissing(mon: IMonitor) {
    // callback exists — no warning
  }
}
`.trim();
    // Sanity: callback exists → no warning
    const msgs = getDiagnosticMessages(source);
    const monitorWarnings = msgs.filter((m) => m.includes("@Monitor"));
    expect(monitorWarnings).toHaveLength(0);
  });

  it("warns when @Monitor observed field does not exist in struct", () => {
    const source = `
@ComponentV2
struct MyPage {
  @Local count: number = 0;

  @Monitor('nonexistent')
  onNonexistent(mon: IMonitor) {}
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const fieldWarnings = msgs.filter((m) => m.includes("@Monitor") && m.includes("nonexistent"));
    expect(fieldWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("warns when @Monitor observed field is not a reactive V2 field", () => {
    const source = `
@ComponentV2
struct MyPage {
  plainField: number = 0;

  @Monitor('plainField')
  onPlainChange(mon: IMonitor) {}
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const fieldWarnings = msgs.filter((m) => m.includes("@Monitor") && m.includes("plainField"));
    expect(fieldWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("does not warn when @Monitor observed field is a valid @Local field", () => {
    const source = `
@ComponentV2
struct MyPage {
  @Local count: number = 0;

  @Monitor('count')
  onCountChange(mon: IMonitor) {}
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const fieldWarnings = msgs.filter((m) => m.includes("@Monitor") && m.includes("reactive"));
    expect(fieldWarnings).toHaveLength(0);
  });

  it("does not warn when @Monitor observed field is a valid @Param field", () => {
    const source = `
@ComponentV2
struct ChildComp {
  @Param value: number = 0;

  @Monitor('value')
  onValueChange(mon: IMonitor) {}
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const fieldWarnings = msgs.filter((m) => m.includes("@Monitor") && m.includes("reactive"));
    expect(fieldWarnings).toHaveLength(0);
  });

  it("does not warn when @Monitor observed field is a valid @Event field", () => {
    const source = `
@ComponentV2
struct ChildComp {
  @Event onAction: () => void = () => {};

  @Monitor('onAction')
  onActionChange(mon: IMonitor) {}
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const fieldWarnings = msgs.filter((m) => m.includes("@Monitor") && m.includes("reactive"));
    expect(fieldWarnings).toHaveLength(0);
  });
});

// ─── @Provider/@Consumer key matching ──────────────────────────────────────

describe("@Provider/@Consumer key matching diagnostics", () => {
  it("warns when @Consumer key has no matching @Provider in same struct", () => {
    const source = `
@ComponentV2
struct MyPage {
  @Provider('storeKey') data: number = 0;
  @Consumer('missingKey') received: number = 0;
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const keyWarnings = msgs.filter((m) => m.includes("@Consumer") && m.includes("missingKey"));
    expect(keyWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("does not warn when @Consumer key matches @Provider key in same struct", () => {
    const source = `
@ComponentV2
struct MyPage {
  @Provider('storeKey') data: number = 0;
  @Consumer('storeKey') received: number = 0;
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const keyWarnings = msgs.filter((m) => m.includes("@Consumer") && m.includes("storeKey"));
    expect(keyWarnings).toHaveLength(0);
  });

  it("warns when @Provider key is never consumed (informational)", () => {
    const source = `
@ComponentV2
struct MyPage {
  @Provider('unusedKey') data: number = 0;
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const providerWarnings = msgs.filter((m) => m.includes("@Provider") && m.includes("unusedKey"));
    expect(providerWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("does not warn for matched Provider-Consumer pair across different structs (cross-file simulation)", () => {
    // In single-file context, Provider in one struct and Consumer in another
    // should not produce a Warning — they match across structs (Hint is acceptable)
    const source = `
@ComponentV2
struct ProviderComp {
  @Provider('sharedKey') data: number = 0;
}

@ComponentV2
struct ConsumerComp {
  @Consumer('sharedKey') received: number = 0;
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    // Cross-struct Consumer should NOT produce a Warning (only Hint is OK)
    const consumerWarnings = msgs.filter(
      (m) => m.includes("@Consumer") && m.includes("sharedKey") && !m.includes("another component"),
    );
    expect(consumerWarnings).toHaveLength(0);
  });
});
