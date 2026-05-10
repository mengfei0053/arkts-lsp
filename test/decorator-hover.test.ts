import { describe, expect, it } from "vitest";
import { Position } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { buildHover } from "../src/hover.js";

function makeDoc(uri: string, text: string): TextDocument {
  return TextDocument.create(uri, "arkts", 1, text);
}

function getHoverMd(hover: any): string {
  return typeof hover.contents === "string" ? hover.contents : hover.contents.value ?? JSON.stringify(hover.contents);
}

describe("P1-2: decorator semantic hover", () => {
  it("shows @Watch decorator info with callback and field name", () => {
    const doc = makeDoc("file:///w1.ets", [
      "@Component",
      "struct MyComp {",
      "  @State @Watch('onCountChange') count: number = 0",
      "  onCountChange(newValue: number) {",
      "    console.log(newValue)",
      "  }",
      "  build() { Column() {} }",
      "}",
    ].join("\n"));

    // Hover on "@Watch" at line 2, char 11 (within @Watch('onCountChange'))
    const hover = buildHover(doc, Position.create(2, 11));
    expect(hover).not.toBeNull();
    const md = getHoverMd(hover);
    expect(md).toContain("@Watch");
    expect(md).toContain("onCountChange");
    expect(md).toContain("count");
  });

  it("shows @State reactive semantics when hovering on @State field", () => {
    const doc = makeDoc("file:///s1.ets", [
      "@Component",
      "struct Card {",
      "  @State message: string = 'hi'",
      "  build() { Column() {} }",
      "}",
    ].join("\n"));

    const hover = buildHover(doc, Position.create(2, 9));
    expect(hover).not.toBeNull();
    const md = getHoverMd(hover);
    expect(md).toContain("@State");
    expect(md).toContain("Reactive state");
  });

  it("shows @Prop one-way binding semantics", () => {
    const doc = makeDoc("file:///p1.ets", [
      "@Component",
      "struct Child {",
      "  @Prop title: string = ''",
      "  build() { Column() {} }",
      "}",
    ].join("\n"));

    const hover = buildHover(doc, Position.create(2, 8));
    expect(hover).not.toBeNull();
    const md = getHoverMd(hover);
    expect(md).toContain("@Prop");
    expect(md).toContain("One-way");
  });

  it("shows @Link two-way binding semantics", () => {
    const doc = makeDoc("file:///l1.ets", [
      "@Component",
      "struct Child {",
      "  @Prop title: string = ''",
      "  @Link count: number",
      "  build() { Column() {} }",
      "}",
    ].join("\n"));

    const hover = buildHover(doc, Position.create(3, 8));
    expect(hover).not.toBeNull();
    const md = getHoverMd(hover);
    expect(md).toContain("@Link");
    expect(md).toContain("Two-way");
  });
});
