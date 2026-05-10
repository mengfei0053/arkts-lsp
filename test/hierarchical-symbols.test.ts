import { describe, it, expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { collectHierarchicalDocumentSymbols } from "../src/symbols.js";
import { SymbolKind } from "vscode-languageserver/node.js";

function makeDoc(uri: string, source: string): TextDocument {
  return TextDocument.create(uri, "arkts", 0, source);
}

describe("hierarchical document symbols", () => {
  it("nests struct members under parent struct", () => {
    const doc = makeDoc("file:///test/Index.ets", `
@Component
struct Index {
  @State message: string = 'hello';
  build() { Text(this.message) }
}
`.trim());

    const result = collectHierarchicalDocumentSymbols(doc);
    expect(result).toHaveLength(1);

    const struct = result[0];
    expect(struct.name).toBe("Index");
    expect(struct.kind).toBe(SymbolKind.Struct);
    expect(struct.children).toBeDefined();
    expect(struct.children.length).toBeGreaterThanOrEqual(2);

    const names = struct.children.map((c) => c.name);
    expect(names).toContain("message");
    expect(names).toContain("build");
  });

  it("handles multiple structs", () => {
    const doc = makeDoc("file:///test/Index.ets", `
@Component
struct Card {
  @Prop title: string = '';
  build() { Text(this.title) }
}

@Entry
@Component
struct Index {
  build() { Card({ title: 'hi' }) }
}
`.trim());

    const result = collectHierarchicalDocumentSymbols(doc);
    expect(result).toHaveLength(2);

    const card = result.find((s) => s.name === "Card");
    expect(card).toBeDefined();
    expect(card!.children.length).toBeGreaterThanOrEqual(2);
  });

  it("includes @Builder methods as children", () => {
    const doc = makeDoc("file:///test/Index.ets", `
@Component
struct Index {
  @Builder
  itemBuilder(name: string) { Text(name) }
  build() { this.itemBuilder('hello') }
}
`.trim());

    const result = collectHierarchicalDocumentSymbols(doc);
    const names = result[0].children.map((c) => c.name);
    expect(names).toContain("itemBuilder");
  });

  it("handles V2 @ComponentV2 with fields and methods", () => {
    const doc = makeDoc("file:///test/Index.ets", `
@ComponentV2
struct Widget {
  @Local count: number = 0;
  @Param label: string = '';
  @Event onChange: () => void = () => {};
  @Monitor('count')
  onCountChange() {}
  build() { Text(this.label) }
}
`.trim());

    const result = collectHierarchicalDocumentSymbols(doc);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Widget");
    expect(result[0].children.length).toBeGreaterThanOrEqual(5);
  });
});
