import { describe, it, expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  prepareTypeHierarchy,
  supertypes,
  subtypes,
} from "../src/type-hierarchy.js";
import { SymbolKind } from "vscode-languageserver/node.js";

function makeDoc(uri: string, source: string): TextDocument {
  return TextDocument.create(uri, "arkts", 0, source);
}

describe("type hierarchy", () => {
  it("prepares type hierarchy for a struct at position", () => {
    const doc = makeDoc("file:///test/Index.ets", `@Component
struct BaseCard {
  @Prop title: string = '';
  build() { Text(this.title) }
}`);

    const result = prepareTypeHierarchy(doc, { line: 1, character: 8 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("BaseCard");
    expect(result[0].kind).toBe(SymbolKind.Struct);
  });

  it("returns empty for position not on a struct/class", () => {
    const doc = makeDoc("file:///test/A.ets", `let x = 1;`);
    const result = prepareTypeHierarchy(doc, { line: 0, character: 0 });
    expect(result).toHaveLength(0);
  });

  it("finds subtypes of a struct (other structs that reference it)", () => {
    const docs = [
      makeDoc("file:///test/Base.ets", `@Component
struct BaseCard {
  @Prop title: string = '';
  build() { Text(this.title) }
}`),
      makeDoc("file:///test/Index.ets", `import { BaseCard } from './Base';

@Component
struct Index {
  build() { BaseCard({ title: 'hi' }) }
}`),
    ];

    const item = prepareTypeHierarchy(docs[0], { line: 1, character: 8 })[0];
    const subs = subtypes(item, docs);
    expect(subs.length).toBeGreaterThanOrEqual(1);
    expect(subs.some((s) => s.name === "Index")).toBe(true);
  });

  it("finds supertypes (imported components used by a struct)", () => {
    const docs = [
      makeDoc("file:///test/Base.ets", `@Component
export struct BaseCard {
  @Prop title: string = '';
  build() { Text(this.title) }
}`),
      makeDoc("file:///test/Index.ets", `import { BaseCard } from './Base';

@Component
struct Index {
  build() { BaseCard({ title: 'hi' }) }
}`),
    ];

    const item = prepareTypeHierarchy(docs[1], { line: 3, character: 8 })[0];
    const supers = supertypes(item, docs);
    expect(supers.length).toBeGreaterThanOrEqual(1);
    expect(supers.some((s) => s.name === "BaseCard")).toBe(true);
  });
});
