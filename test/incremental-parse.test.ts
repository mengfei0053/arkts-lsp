import { describe, it, expect, afterEach } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { parseArkTS, parseArkTSIncremental, applyDocumentEdit, clearParseCache } from "../src/parser.js";

function makeDoc(uri: string, source: string, version = 0): TextDocument {
  return TextDocument.create(uri, "arkts", version, source);
}

describe("incremental parsing", () => {
  afterEach(() => {
    clearParseCache();
  });

  it("re-parses incrementally after a small edit", () => {
    const source = `@Component
struct Index {
  @State message: string = 'hello';
  build() { Text(this.message) }
}`;
    const doc = makeDoc("file:///test/Index.ets", source, 1);

    // First parse — full
    const tree1 = parseArkTS(doc);
    expect(tree1).not.toBeNull();
    expect(tree1!.rootNodeType).toBe("program");

    // Apply a small edit: change 'hello' to 'world'
    const edit = {
      range: {
        start: { line: 2, character: 29 },
        end: { line: 2, character: 34 },
      },
      text: "world",
    };

    applyDocumentEdit(doc.uri, [edit], source);

    // Update document
    const newSource = source.replace("'hello'", "'world'");
    const newDoc = makeDoc("file:///test/Index.ets", newSource, 2);

    // Second parse — should be incremental (using edited old tree)
    const tree2 = parseArkTSIncremental(newDoc);
    expect(tree2).not.toBeNull();
    expect(tree2!.rootNodeType).toBe("program");
  });

  it("falls back to full parse when no cached tree exists", () => {
    const source = `@Component struct A { build() { Text('hi') } }`;
    const doc = makeDoc("file:///test/A.ets", source, 1);

    // No prior parse — should still work via fallback
    const tree = parseArkTSIncremental(doc);
    expect(tree).not.toBeNull();
  });

  it("handles multiple sequential edits", () => {
    const source = `@Component
struct Index {
  @State count: number = 0;
  build() { Text('count: ' + this.count) }
}`;
    const doc = makeDoc("file:///test/Index.ets", source, 1);
    parseArkTS(doc);

    // Edit 1: change 0 to 1
    const edit1 = {
      range: {
        start: { line: 2, character: 25 },
        end: { line: 2, character: 26 },
      },
      text: "1",
    };
    applyDocumentEdit(doc.uri, [edit1], source);

    const source2 = source.replace("= 0;", "= 1;");
    const doc2 = makeDoc("file:///test/Index.ets", source2, 2);
    const tree2 = parseArkTSIncremental(doc2);
    expect(tree2).not.toBeNull();

    // Edit 2: change 1 to 42
    const edit2 = {
      range: {
        start: { line: 2, character: 25 },
        end: { line: 2, character: 26 },
      },
      text: "42",
    };
    applyDocumentEdit(doc2.uri, [edit2], source2);

    const source3 = source2.replace("= 1;", "= 42;");
    const doc3 = makeDoc("file:///test/Index.ets", source3, 3);
    const tree3 = parseArkTSIncremental(doc3);
    expect(tree3).not.toBeNull();
  });

  it("full content change falls back gracefully", () => {
    const source = `@Component struct A { build() { Text('hi') } }`;
    const doc = makeDoc("file:///test/A.ets", source, 1);
    parseArkTS(doc);

    // Full content change (no range = full replacement)
    const edit = { text: `@Component struct B { build() { Button('click') } }` };
    applyDocumentEdit(doc.uri, [edit], source);

    const newDoc = makeDoc("file:///test/A.ets", edit.text, 2);
    const tree = parseArkTSIncremental(newDoc);
    expect(tree).not.toBeNull();
  });
});
