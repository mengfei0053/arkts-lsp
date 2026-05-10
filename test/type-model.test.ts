import { describe, it, expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { parseArkTS } from "../src/parser.js";
import type { ArkTSNode } from "../src/parser.js";
import {
  extractTypeAnnotation,
  parseTypeName,
  isUnionType,
  isNullable,
  getUnionMembers,
  flattenUnionType,
  getTypeAtPosition,
} from "../src/type-model.js";

function makeDoc(uri: string, source: string): TextDocument {
  return TextDocument.create(uri, "arkts", 0, source);
}

describe("type model: extractTypeAnnotation", () => {
  it("extracts primitive type annotation from variable declaration", () => {
    const doc = makeDoc("file:///test.ets", `let name: string = "hello";`);
    const tree = parseArkTS(doc);
    const label = tree.rootNode.children.find(
      (c) => c.type === "lexical_declaration",
    );
    expect(label).toBeDefined();
    const decl = label!.children.find(
      (c) => c.type === "variable_declarator",
    );
    expect(decl).toBeDefined();

    const typeNode = extractTypeAnnotation(decl!);
    expect(typeNode).not.toBeNull();
    expect(typeNode!.type).toBe("type_annotation");
    expect(typeNode!.text).toBe(": string");
  });

  it("extracts union type annotation", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let value: string | number = "x";`,
    );
    const tree = parseArkTS(doc);
    const label = tree.rootNode.children.find(
      (c) => c.type === "lexical_declaration",
    );
    const decl = label!.children.find(
      (c) => c.type === "variable_declarator",
    );
    const typeNode = extractTypeAnnotation(decl!);
    expect(typeNode).not.toBeNull();
    expect(typeNode!.type).toBe("type_annotation");
    expect(typeNode!.text).toBe(": string | number");
  });

  it("extracts array type annotation", () => {
    const doc = makeDoc("file:///test.ets", `let items: string[] = [];`);
    const tree = parseArkTS(doc);
    const label = tree.rootNode.children.find(
      (c) => c.type === "lexical_declaration",
    );
    const decl = label!.children.find(
      (c) => c.type === "variable_declarator",
    );
    const typeNode = extractTypeAnnotation(decl!);
    expect(typeNode).not.toBeNull();
    expect(typeNode!.type).toBe("type_annotation");
    // type_annotation contains ": string[]"
    const arrayNode = typeNode!.children.find(
      (c) => c.type === "array_type",
    );
    expect(arrayNode).toBeDefined();
  });

  it("returns null when no type annotation present", () => {
    const doc = makeDoc("file:///test.ets", `let x = 42;`);
    const tree = parseArkTS(doc);
    const label = tree.rootNode.children.find(
      (c) => c.type === "lexical_declaration",
    );
    const decl = label!.children.find(
      (c) => c.type === "variable_declarator",
    );
    const typeNode = extractTypeAnnotation(decl!);
    expect(typeNode).toBeNull();
  });
});

describe("type model: parseTypeName", () => {
  it("parses primitive type name", () => {
    const doc = makeDoc("file:///test.ets", `let a: string = "x";`);
    const tree = parseArkTS(doc);
    const label = tree.rootNode.children.find(
      (c) => c.type === "lexical_declaration",
    );
    const decl = label!.children.find(
      (c) => c.type === "variable_declarator",
    );
    const typeNode = extractTypeAnnotation(decl!);
    const name = parseTypeName(typeNode!);
    expect(name).toBe("string");
  });

  it("parses union type name", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let a: string | number = "x";`,
    );
    const tree = parseArkTS(doc);
    const label = tree.rootNode.children.find(
      (c) => c.type === "lexical_declaration",
    );
    const decl = label!.children.find(
      (c) => c.type === "variable_declarator",
    );
    const typeNode = extractTypeAnnotation(decl!);
    const name = parseTypeName(typeNode!);
    expect(name).toBe("string | number");
  });

  it("parses array type name", () => {
    const doc = makeDoc("file:///test.ets", `let a: string[] = [];`);
    const tree = parseArkTS(doc);
    const label = tree.rootNode.children.find(
      (c) => c.type === "lexical_declaration",
    );
    const decl = label!.children.find(
      (c) => c.type === "variable_declarator",
    );
    const typeNode = extractTypeAnnotation(decl!);
    const name = parseTypeName(typeNode!);
    expect(name).toBe("string[]");
  });

  it("parses generic type name", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let a: Array<string> = [];`,
    );
    const tree = parseArkTS(doc);
    const label = tree.rootNode.children.find(
      (c) => c.type === "lexical_declaration",
    );
    const decl = label!.children.find(
      (c) => c.type === "variable_declarator",
    );
    const typeNode = extractTypeAnnotation(decl!);
    const name = parseTypeName(typeNode!);
    expect(name).toBe("Array<string>");
  });
});

describe("type model: isUnionType", () => {
  it("detects union type", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let a: string | number = "x";`,
    );
    const tree = parseArkTS(doc);
    const label = tree.rootNode.children.find(
      (c) => c.type === "lexical_declaration",
    );
    const decl = label!.children.find(
      (c) => c.type === "variable_declarator",
    );
    const typeNode = extractTypeAnnotation(decl!);
    expect(isUnionType(typeNode!)).toBe(true);
  });

  it("returns false for non-union type", () => {
    const doc = makeDoc("file:///test.ets", `let a: string = "x";`);
    const tree = parseArkTS(doc);
    const label = tree.rootNode.children.find(
      (c) => c.type === "lexical_declaration",
    );
    const decl = label!.children.find(
      (c) => c.type === "variable_declarator",
    );
    const typeNode = extractTypeAnnotation(decl!);
    expect(isUnionType(typeNode!)).toBe(false);
  });

  it("returns false for intersection type", () => {
    const doc = makeDoc("file:///test.ets", `let a: string & number = "x";`);
    const tree = parseArkTS(doc);
    const label = tree.rootNode.children.find(
      (c) => c.type === "lexical_declaration",
    );
    const decl = label!.children.find(
      (c) => c.type === "variable_declarator",
    );
    const typeNode = extractTypeAnnotation(decl!);
    // intersection_type is not union
    expect(isUnionType(typeNode!)).toBe(false);
  });
});

describe("type model: isNullable", () => {
  it("detects null in union", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let a: string | null = null;`,
    );
    const tree = parseArkTS(doc);
    const label = tree.rootNode.children.find(
      (c) => c.type === "lexical_declaration",
    );
    const decl = label!.children.find(
      (c) => c.type === "variable_declarator",
    );
    const typeNode = extractTypeAnnotation(decl!);
    expect(isNullable(typeNode!)).toBe(true);
  });

  it("detects undefined in union", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let a: string | undefined = undefined;`,
    );
    const tree = parseArkTS(doc);
    const label = tree.rootNode.children.find(
      (c) => c.type === "lexical_declaration",
    );
    const decl = label!.children.find(
      (c) => c.type === "variable_declarator",
    );
    const typeNode = extractTypeAnnotation(decl!);
    expect(isNullable(typeNode!)).toBe(true);
  });

  it("returns false for non-nullable type", () => {
    const doc = makeDoc("file:///test.ets", `let a: string = "x";`);
    const tree = parseArkTS(doc);
    const label = tree.rootNode.children.find(
      (c) => c.type === "lexical_declaration",
    );
    const decl = label!.children.find(
      (c) => c.type === "variable_declarator",
    );
    const typeNode = extractTypeAnnotation(decl!);
    expect(isNullable(typeNode!)).toBe(false);
  });
});

describe("type model: getUnionMembers", () => {
  it("gets members of a 2-element union", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let a: string | number = "x";`,
    );
    const tree = parseArkTS(doc);
    const label = tree.rootNode.children.find(
      (c) => c.type === "lexical_declaration",
    );
    const decl = label!.children.find(
      (c) => c.type === "variable_declarator",
    );
    const typeNode = extractTypeAnnotation(decl!);
    // type_annotation has a union_type child
    const members = getUnionMembers(typeNode!);
    expect(members.length).toBe(2);
    expect(members.map((m) => m.text)).toEqual(["string", "number"]);
  });

  it("gets members of a 3-element union", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let a: string | number | boolean = "x";`,
    );
    const tree = parseArkTS(doc);
    const label = tree.rootNode.children.find(
      (c) => c.type === "lexical_declaration",
    );
    const decl = label!.children.find(
      (c) => c.type === "variable_declarator",
    );
    const typeNode = extractTypeAnnotation(decl!);
    const members = flattenUnionType(typeNode!);
    expect(members.length).toBe(3);
    expect(members.map((m) => m.text)).toEqual([
      "string",
      "number",
      "boolean",
    ]);
  });

  it("returns single element for non-union type", () => {
    const doc = makeDoc("file:///test.ets", `let a: string = "x";`);
    const tree = parseArkTS(doc);
    const label = tree.rootNode.children.find(
      (c) => c.type === "lexical_declaration",
    );
    const decl = label!.children.find(
      (c) => c.type === "variable_declarator",
    );
    const typeNode = extractTypeAnnotation(decl!);
    const members = getUnionMembers(typeNode!);
    expect(members.length).toBe(1);
    expect(members[0].text).toBe("string");
  });
});

describe("type model: getTypeAtPosition", () => {
  it("finds type annotation at a position inside the type region", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let a: string | number = "x";\nlet b: number = 42;`,
    );
    const tree = parseArkTS(doc);
    // position on the 'string' part of the first line
    const typeNode = getTypeAtPosition(tree, 0, 9);
    expect(typeNode).not.toBeNull();
    expect(typeNode!.text).toBe(": string | number");
  });

  it("returns null for position not in a type annotation", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let a: string = "x";`,
    );
    const tree = parseArkTS(doc);
    const typeNode = getTypeAtPosition(tree, 0, 0);
    expect(typeNode).toBeNull();
  });

  it("finds generic type annotation", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let a: Array<string> = [];`,
    );
    const tree = parseArkTS(doc);
    const typeNode = getTypeAtPosition(tree, 0, 12);
    expect(typeNode).not.toBeNull();
    expect(typeNode!.text).toBe(": Array<string>");
  });

  it("finds intersection type", () => {
    const doc = makeDoc(
      "file:///test.ets",
      `let a: string & number = "x";`,
    );
    const tree = parseArkTS(doc);
    const typeNode = getTypeAtPosition(tree, 0, 11);
    expect(typeNode).not.toBeNull();
    expect(typeNode!.text).toBe(": string & number");
  });
});
