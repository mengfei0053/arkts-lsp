import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { parseArkTS, getBuildMethodComponentTree, getBuildMethodComponentCalls, getStructDeclarations } from "../src/parser.js";

function makeDoc(uri: string, text: string): TextDocument {
  return TextDocument.create(uri, "arkts", 1, text);
}

describe("build method patterns", () => {
  it("normal pattern: build() as method_definition (no @State before)", () => {
    const doc = makeDoc("file:///normal.ets", [
      "@Component",
      "struct Simple {",
      "  build() {",
      "    Column() {",
      "      Text('hello')",
      "    }",
      "  }",
      "}",
    ].join("\n"));

    const tree = parseArkTS(doc);
    expect(tree).not.toBeNull();
    const structs = getStructDeclarations(tree!);
    const simple = structs.find(s => s.name === "Simple");
    expect(simple).toBeDefined();
    
    const treeResult = getBuildMethodComponentTree(tree!, "Simple");
    console.log("Normal pattern tree:", JSON.stringify(treeResult, null, 2));
    expect(treeResult.length).toBeGreaterThan(0);
    expect(treeResult[0].name).toBe("Column");
  });

  it("error-recovery pattern: build() after @State field", () => {
    const doc = makeDoc("file:///with-state.ets", [
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

    const tree = parseArkTS(doc);
    expect(tree).not.toBeNull();
    const structs = getStructDeclarations(tree!);
    const card = structs.find(s => s.name === "Card");
    expect(card).toBeDefined();
    
    const treeResult = getBuildMethodComponentTree(tree!, "Card");
    console.log("Error-recovery pattern tree:", JSON.stringify(treeResult, null, 2));
    expect(treeResult.length).toBeGreaterThan(0);
    expect(treeResult[0].name).toBe("Column");
    expect(treeResult[0].children.length).toBeGreaterThan(0);
    expect(treeResult[0].children[0].name).toBe("Text");
  });

  it("component calls work in both patterns", () => {
    const doc1 = makeDoc("file:///c1.ets", [
      "@Component", "struct S1 {", "  build() {", "    Column() {}", "  }", "}",
    ].join("\n"));
    const doc2 = makeDoc("file:///c2.ets", [
      "@Component", "struct S2 {", "  @State x: number = 1", "  build() {", "    Row() {}", "  }", "}",
    ].join("\n"));

    const t1 = parseArkTS(doc1)!;
    const t2 = parseArkTS(doc2)!;
    expect(getBuildMethodComponentCalls(t1, "S1")).toContain("Column");
    expect(getBuildMethodComponentCalls(t2, "S2")).toContain("Row");
  });
});
