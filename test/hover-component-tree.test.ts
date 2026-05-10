import { describe, expect, it } from "vitest";
import { Position } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { buildHover } from "../src/hover.js";

function makeDoc(uri: string, text: string): TextDocument {
  return TextDocument.create(uri, "arkts", 1, text);
}

describe("component tree hover integration", () => {
  it("shows UI Component info for Column in build() (with @State)", () => {
    const doc = makeDoc("file:///hover1.ets", [
      "@Component",
      "struct Card {",
      "  @State message: string = 'hi'",
      "  build() {",
      "    Column() {",
      "      Text(this.message)",
      "    }",
      "  }",
      "}",
    ].join("\n"));

    const hover = buildHover(doc, Position.create(4, 7));
    expect(hover).not.toBeNull();
    const md = typeof hover!.contents === "string" ? hover!.contents : (hover!.contents as any).value ?? JSON.stringify(hover!.contents);
    console.log("Hover for Column (with @State):", md);
    expect(md).toContain("Column");
    expect(md).toContain("UI Component");
  });

  it("shows UI Component info for Column in build() (no @State)", () => {
    const doc = makeDoc("file:///hover2.ets", [
      "@Component",
      "struct Simple {",
      "  build() {",
      "    Column() {",
      "      Text('hello')",
      "    }",
      "  }",
      "}",
    ].join("\n"));

    const hover = buildHover(doc, Position.create(3, 7));
    expect(hover).not.toBeNull();
    const md = typeof hover!.contents === "string" ? hover!.contents : (hover!.contents as any).value ?? JSON.stringify(hover!.contents);
    console.log("Hover for Column (no @State):", md);
    expect(md).toContain("Column");
    expect(md).toContain("UI Component");
  });

  it("shows UI Component for Text inside Column (with @State)", () => {
    const doc = makeDoc("file:///hover3.ets", [
      "@Component",
      "struct Card {",
      "  @State message: string = 'hi'",
      "  build() {",
      "    Column() {",
      "      Text(this.message)",
      "    }",
      "  }",
      "}",
    ].join("\n"));

    const hover = buildHover(doc, Position.create(5, 10));
    expect(hover).not.toBeNull();
    const md = typeof hover!.contents === "string" ? hover!.contents : (hover!.contents as any).value ?? JSON.stringify(hover!.contents);
    console.log("Hover for Text:", md);
    expect(md).toContain("Text");
  });
});
