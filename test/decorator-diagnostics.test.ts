import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { collectDiagnostics } from "../src/diagnostics.js";

function makeDoc(uri: string, text: string): TextDocument {
  return TextDocument.create(uri, "arkts", 1, text);
}

const defaultSettings = { maxNumberOfProblems: 100 };

describe("P1-3: @Watch diagnostics", () => {
  it("warns when @Watch callback does not exist in struct", () => {
    const doc = makeDoc("file:///d1.ets", [
      "@Component",
      "struct Bad {",
      "  @State @Watch('onMissing') count: number = 0",
      "  build() { Column() {} }",
      "}",
    ].join("\n"));

    const diags = collectDiagnostics(doc, defaultSettings);
    const watchDiag = diags.find(d => d.message.includes("onMissing"));
    expect(watchDiag).toBeDefined();
    expect(watchDiag!.severity).toBe(2); // Warning
    expect(watchDiag!.message).toContain("@Watch");
    expect(watchDiag!.message).toContain("onMissing");
  });

  it("no warning when @Watch callback exists", () => {
    const doc = makeDoc("file:///d2.ets", [
      "@Component",
      "struct Good {",
      "  @State @Watch('onCountChange') count: number = 0",
      "  onCountChange(newValue: number) {",
      "    console.log(newValue)",
      "  }",
      "  build() { Column() {} }",
      "}",
    ].join("\n"));

    const diags = collectDiagnostics(doc, defaultSettings);
    const watchDiag = diags.find(d => d.message.includes("onCountChange"));
    expect(watchDiag).toBeUndefined();
  });

  it("warns for each missing @Watch callback", () => {
    const doc = makeDoc("file:///d3.ets", [
      "@Component",
      "struct Multi {",
      "  @State @Watch('onA') a: number = 0",
      "  @State @Watch('onB') b: string = ''",
      "  onA() {}",
      "  build() { Column() {} }",
      "}",
    ].join("\n"));

    const diags = collectDiagnostics(doc, defaultSettings);
    const watchDiags = diags.filter(d => d.message.includes("@Watch"));
    // onA exists, onB doesn't
    expect(watchDiags.length).toBe(1);
    expect(watchDiags[0].message).toContain("onB");
  });
});
