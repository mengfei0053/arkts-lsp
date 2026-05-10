import { describe, it, expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { buildCodeLenses } from "../src/codelens.js";
import { CodeLensParams } from "vscode-languageserver/node.js";

function makeDoc(uri: string, source: string): TextDocument {
  return TextDocument.create(uri, "arkts", 0, source);
}

const dummyParams: CodeLensParams = {
  textDocument: { uri: "file:///test/Index.ets" },
};

describe("buildCodeLenses", () => {
  it("shows CodeLens above @Component struct with tree info", () => {
    const doc = makeDoc("file:///test/Index.ets", `
@Entry
@Component
struct Index {
  build() {
    Column() {
      Text('hello')
      Button('click')
    }
  }
}
`.trim());

    const lenses = buildCodeLenses(doc, dummyParams);
    expect(lenses.length).toBeGreaterThanOrEqual(1);
    expect(lenses[0].command?.title).toContain("@Component");
  });

  it("shows props count in CodeLens", () => {
    const doc = makeDoc("file:///test/Card.ets", `
@Component
export struct Card {
  @Prop title: string = '';
  @Link count: number;

  build() {
    Column() { Text(this.title) }
  }
}
`.trim());

    const lenses = buildCodeLenses(doc, dummyParams);
    expect(lenses.length).toBeGreaterThanOrEqual(1);
    expect(lenses[0].command?.title).toContain("props: 2");
  });

  it("shows @ComponentV2 label for V2 components", () => {
    const doc = makeDoc("file:///test/Widget.ets", `
@ComponentV2
struct Widget {
  @Param label: string = '';

  build() { Text(this.label) }
}
`.trim());

    const lenses = buildCodeLenses(doc, dummyParams);
    expect(lenses[0].command?.title).toContain("@ComponentV2");
  });

  it("returns empty for non-component structs", () => {
    const doc = makeDoc("file:///test/Helper.ets", `
struct Helper {
  value: number = 0;
}
`.trim());

    const lenses = buildCodeLenses(doc, dummyParams);
    expect(lenses).toHaveLength(0);
  });
});
