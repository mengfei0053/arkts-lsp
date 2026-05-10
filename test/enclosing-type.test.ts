import { describe, expect, it } from "vitest";
import { Position } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getEnclosingTypeContextAtPosition } from "../src/text.js";
import { findDocumentMemberSymbolAtPosition, collectTypeMemberSymbols } from "../src/symbols.js";
import { findDefinitions } from "../src/navigation.js";

function makeDoc(uri: string, text: string): TextDocument {
  return TextDocument.create(uri, "arkts", 1, text);
}

describe("parser-based enclosing type resolution", () => {
  it("resolves enclosing struct at this.member position inside build()", () => {
    const doc = makeDoc("file:///a.ets", [
      "@Component",
      "struct MyPage {",
      "  @State message: string = 'hi'",
      "  build() {",
      "    Column() {",
      "      Text(this.message)",
      "    }",
      "  }",
      "}",
    ].join("\n"));
    // L5: "      Text(this.message)" — "this." is chars 11-15, cursor at 16
    const result = getEnclosingTypeContextAtPosition(doc, Position.create(5, 16));
    expect(result?.name).toBe("MyPage");
    expect(result?.kind).toBe("struct");
  });

  it("resolves enclosing class at member position", () => {
    const doc = makeDoc("file:///a.ets", [
      "class DataModel {",
      "  id: number = 0",
      "  name: string = ''",
      "}",
    ].join("\n"));
    const result = getEnclosingTypeContextAtPosition(doc, Position.create(1, 4));
    expect(result?.name).toBe("DataModel");
    expect(result?.kind).toBe("class");
  });

  it("resolves innermost type when nested structures exist", () => {
    const doc = makeDoc("file:///a.ets", [
      "struct Outer {",
      "  @State value: number = 1",
      "  build() {",
      "    Column() { }",
      "  }",
      "}",
      "",
      "struct Inner {",
      "  @State label: string = 'x'",
      "  build() {",
      "    Row() { }",
      "  }",
      "}",
    ].join("\n"));
    // Position inside Inner struct
    const result = getEnclosingTypeContextAtPosition(doc, Position.create(8, 10));
    expect(result?.name).toBe("Inner");
  });

  it("resolves enclosing type for decorator-separated struct declarations", () => {
    const doc = makeDoc("file:///a.ets", [
      "@Entry",
      "@Component",
      "struct Index {",
      "  @State count: number = 0",
      "  build() {",
      "    Text(this.count.toString())",
      "  }",
      "}",
    ].join("\n"));
    // Inside build() at this.count
    const result = getEnclosingTypeContextAtPosition(doc, Position.create(5, 14));
    expect(result?.name).toBe("Index");
  });

  it("finds definition of this.member across full navigation chain", () => {
    const doc = makeDoc("file:///a.ets", [
      "@Component",
      "struct Card {",
      "  @Prop title: string = ''",
      "  @State visible: boolean = true",
      "  build() {",
      "    Text(this.title)",
      "  }",
      "}",
    ].join("\n"));
    // "title" is at L5, char 15-20
    const pos = Position.create(5, 18);
    const member = findDocumentMemberSymbolAtPosition(doc, pos);
    expect(member?.name).toBe("title");

    const defs = findDefinitions({ document: doc, documents: [doc], symbols: [] }, pos);
    expect(defs.length).toBeGreaterThan(0);
    expect(defs[0].range.start.line).toBe(2); // @Prop title line
  });

  it("returns null for position outside any type body", () => {
    const doc = makeDoc("file:///a.ets", [
      "const topValue = 42;",
      "",
      "struct Page { }",
    ].join("\n"));
    const result = getEnclosingTypeContextAtPosition(doc, Position.create(0, 5));
    expect(result).toBeNull();
  });

  it("handles single-line struct declarations", () => {
    const doc = makeDoc("file:///a.ets", "@Component export struct Mini { @State x: number = 1 build() { this.x } }");
    // "this.x" is inside the struct body
    const thisPos = doc.getText().indexOf("this.x");
    const line = 0;
    const char = thisPos + 5; // at 'x'
    const result = getEnclosingTypeContextAtPosition(doc, Position.create(line, char));
    expect(result?.name).toBe("Mini");
  });
});
