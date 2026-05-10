import { describe, it, expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { parseArkTS } from "../src/parser.js";
import {
  buildTypeInlayHints,
  inferTypeFromInitializer,
} from "../src/type-inlay.js";

function makeDoc(uri: string, source: string): TextDocument {
  return TextDocument.create(uri, "arkts", 0, source);
}

describe("type inlay: inferTypeFromInitializer", () => {
  it("infers number from numeric literal", () => {
    expect(inferTypeFromInitializer("42")).toBe("number");
  });

  it("infers string from string literal", () => {
    expect(inferTypeFromInitializer('"hello"')).toBe("string");
  });

  it("infers boolean from true", () => {
    expect(inferTypeFromInitializer("true")).toBe("boolean");
  });

  it("infers boolean from false", () => {
    expect(inferTypeFromInitializer("false")).toBe("boolean");
  });

  it("infers string from template literal", () => {
    expect(inferTypeFromInitializer("`hello ${name}`")).toBe("string");
  });

  it("infers type from new expression", () => {
    expect(inferTypeFromInitializer("new Foo()")).toBe("Foo");
  });

  it("returns null for complex expressions", () => {
    expect(inferTypeFromInitializer("someFunction()")).toBeNull();
  });
});

describe("type inlay: buildTypeInlayHints", () => {
  it("shows type hint for untyped number variable", () => {
    const doc = makeDoc("file:///test.ets", `let count = 42;`);
    const tree = parseArkTS(doc)!;
    const hints = buildTypeInlayHints(tree);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({
      position: { line: 0, character: 9 }, // after "count"
      label: ": number",
    });
  });

  it("shows type hint for untyped string variable", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let name = "hello";`,
    );
    const tree = parseArkTS(doc)!;
    const hints = buildTypeInlayHints(tree);
    expect(hints).toHaveLength(1);
    expect(hints[0].label).toBe(": string");
  });

  it("shows type hint for untyped boolean variable", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let flag = true;`,
    );
    const tree = parseArkTS(doc)!;
    const hints = buildTypeInlayHints(tree);
    expect(hints).toHaveLength(1);
    expect(hints[0].label).toBe(": boolean");
  });

  it("skips variables that already have type annotation", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let count: number = 42;`,
    );
    const tree = parseArkTS(doc)!;
    const hints = buildTypeInlayHints(tree);
    expect(hints).toHaveLength(0);
  });

  it("skips variables with complex initializers", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let result = someFn();`,
    );
    const tree = parseArkTS(doc)!;
    const hints = buildTypeInlayHints(tree);
    expect(hints).toHaveLength(0);
  });

  it("handles multiple variables on same line", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let a = 1; let b = "x";`,
    );
    const tree = parseArkTS(doc)!;
    const hints = buildTypeInlayHints(tree);
    expect(hints).toHaveLength(2);
    expect(hints[0].label).toBe(": number");
    expect(hints[1].label).toBe(": string");
  });

  it("shows type hint for untyped const variables", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `const pi = 3.14;`,
    );
    const tree = parseArkTS(doc)!;
    const hints = buildTypeInlayHints(tree);
    expect(hints).toHaveLength(1);
    expect(hints[0].label).toBe(": number");
  });

  it("shows type hint for new expression", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let obj = new Person();`,
    );
    const tree = parseArkTS(doc)!;
    const hints = buildTypeInlayHints(tree);
    expect(hints).toHaveLength(1);
    expect(hints[0].label).toBe(": Person");
  });
});
