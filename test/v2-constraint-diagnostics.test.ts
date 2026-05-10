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

// ─── V1/V2 Decorator Mixing ────────────────────────────────────────────────

describe("V1/V2 decorator mixing diagnostics", () => {
  it("warns when V1 decorator is used inside @ComponentV2 struct", () => {
    const source = `
@ComponentV2
struct MyPage {
  @State count: number = 0;
  @Local name: string = '';
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const mixWarnings = msgs.filter((m) => m.includes("@State") && m.includes("V2"));
    expect(mixWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("warns when V2 decorator is used inside @Component struct", () => {
    const source = `
@Component
struct MyPage {
  @Local count: number = 0;
  @State name: string = '';
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const mixWarnings = msgs.filter((m) => m.includes("@Local") && m.includes("V1"));
    expect(mixWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("does not warn when V1 decorators are used inside @Component struct", () => {
    const source = `
@Component
struct MyPage {
  @State count: number = 0;
  @Prop name: string = '';
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const mixWarnings = msgs.filter((m) => m.includes("V1/V2") || m.includes("mixing"));
    expect(mixWarnings).toHaveLength(0);
  });

  it("does not warn when V2 decorators are used inside @ComponentV2 struct", () => {
    const source = `
@ComponentV2
struct MyPage {
  @Local count: number = 0;
  @Param name: string = '';
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const mixWarnings = msgs.filter((m) => m.includes("V1/V2") || m.includes("mixing"));
    expect(mixWarnings).toHaveLength(0);
  });
});

// ─── @Param/@Event Scope ───────────────────────────────────────────────────

describe("@Param/@Event scope diagnostics", () => {
  it("warns when @Param is used outside @ComponentV2", () => {
    const source = `
@Component
struct MyPage {
  @Param value: number = 0;
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const scopeWarnings = msgs.filter((m) => m.includes("@Param") && m.includes("@ComponentV2"));
    expect(scopeWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("warns when @Event is used outside @ComponentV2", () => {
    const source = `
@Component
struct MyPage {
  @Event onAction: () => void = () => {};
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const scopeWarnings = msgs.filter((m) => m.includes("@Event") && m.includes("@ComponentV2"));
    expect(scopeWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("does not warn when @Param is used inside @ComponentV2", () => {
    const source = `
@ComponentV2
struct ChildComp {
  @Param value: number = 0;
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const scopeWarnings = msgs.filter((m) => m.includes("@Param") && m.includes("@ComponentV2"));
    expect(scopeWarnings).toHaveLength(0);
  });
});

// ─── @Computed Getter ──────────────────────────────────────────────────────

describe("@Computed getter diagnostics", () => {
  it("warns when @Computed is not a getter", () => {
    const source = `
@ComponentV2
struct MyPage {
  @Local count: number = 0;

  @Computed
  doubleCount(): number {
    return this.count * 2;
  }
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const computedWarnings = msgs.filter((m) => m.includes("@Computed") && m.includes("getter"));
    expect(computedWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("does not warn when @Computed is a getter", () => {
    const source = `
@ComponentV2
struct MyPage {
  @Local count: number = 0;

  @Computed
  get doubleCount(): number {
    return this.count * 2;
  }
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const computedWarnings = msgs.filter((m) => m.includes("@Computed") && m.includes("getter"));
    expect(computedWarnings).toHaveLength(0);
  });
});

// ─── @Trace Scope ──────────────────────────────────────────────────────────

describe("@Trace scope diagnostics", () => {
  it("warns when @Trace is used outside @ObservedV2 class", () => {
    const source = `
@ComponentV2
struct MyPage {
  @Trace count: number = 0;
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const traceWarnings = msgs.filter((m) => m.includes("@Trace") && m.includes("@ObservedV2"));
    expect(traceWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("does not warn when @Trace is used inside @ObservedV2 class", () => {
    const source = `
@ObservedV2
class DataModel {
  @Trace name: string = '';
}
`.trim();
    const msgs = getDiagnosticMessages(source);
    const traceWarnings = msgs.filter((m) => m.includes("@Trace") && m.includes("@ObservedV2"));
    expect(traceWarnings).toHaveLength(0);
  });
});
