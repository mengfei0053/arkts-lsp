import { describe, it, expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getComponentProps, type ComponentPropInfo } from "../src/component-props.js";

function makeDoc(uri: string, source: string): TextDocument {
  return TextDocument.create(uri, "arkts", 0, source);
}

describe("getComponentProps", () => {
  it("extracts V1 @Prop and @Link fields", () => {
    const doc = makeDoc("file:///test/Card.ets", `
@Component
export struct Card {
  @Prop title: string = '';
  @Link count: number;
  @State internal: number = 0;

  build() {
    Column() { Text(this.title) }
  }
}
`.trim());

    const props = getComponentProps(doc, "Card");
    expect(props).toHaveLength(2);
    expect(props[0]).toEqual({
      name: "title",
      decorator: "Prop",
      type: "string",
      hasDefault: true,
      isV2: false,
    });
    expect(props[1]).toEqual({
      name: "count",
      decorator: "Link",
      type: "number",
      hasDefault: false,
      isV2: false,
    });
  });

  it("extracts V2 @Param and @Event fields", () => {
    const doc = makeDoc("file:///test/Widget.ets", `
@ComponentV2
export struct Widget {
  @Param label: string = '';
  @Event onChange: (val: number) => void = () => {};
  @Local internal: number = 0;

  build() {
    Text(this.label)
  }
}
`.trim());

    const props = getComponentProps(doc, "Widget");
    expect(props).toHaveLength(2);
    expect(props[0]).toEqual({
      name: "label",
      decorator: "Param",
      type: "string",
      hasDefault: true,
      isV2: true,
    });
    expect(props[1]).toEqual({
      name: "onChange",
      decorator: "Event",
      type: "(val: number) => void",
      hasDefault: true,
      isV2: true,
    });
  });

  it("returns empty for non-component struct", () => {
    const doc = makeDoc("file:///test/Helper.ets", `
struct Helper {
  value: number = 0;
}
`.trim());

    const props = getComponentProps(doc, "Helper");
    expect(props).toHaveLength(0);
  });

  it("returns empty when struct not found", () => {
    const doc = makeDoc("file:///test/Empty.ets", `
@Component
struct Other { build() { Text('hi') } }
`.trim());

    const props = getComponentProps(doc, "NonExistent");
    expect(props).toHaveLength(0);
  });

  it("handles ERROR recovery for decorated fields", () => {
    const doc = makeDoc("file:///test/Broken.ets", `
@Component
export struct Broken {
  @Prop name: string
  @Link value: number
  build() { Text('broken') }
}
`.trim());

    const props = getComponentProps(doc, "Broken");
    // Even with parsing errors, should still extract props
    expect(props.length).toBeGreaterThanOrEqual(1);
  });

  it("excludes non-prop decorators (@State, @Local, @Provide, etc.)", () => {
    const doc = makeDoc("file:///test/Mixed.ets", `
@Component
export struct Mixed {
  @Prop title: string = '';
  @State count: number = 0;
  @Provide theme: string = 'dark';
  @Track label: string = '';

  build() { Text(this.title) }
}
`.trim());

    const props = getComponentProps(doc, "Mixed");
    expect(props).toHaveLength(1);
    expect(props[0].name).toBe("title");
  });
});
