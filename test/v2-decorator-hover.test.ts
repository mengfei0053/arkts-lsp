import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { buildHover } from "../src/hover.js";

function makeDoc(uri: string, text: string): TextDocument {
  return TextDocument.create(uri, "arkts", 1, text);
}

describe("P0-V2b: V2 decorator hover + completion", () => {
  describe("hover for V2 field decorators", () => {
    it("shows @Local description in member hover", () => {
      const doc = makeDoc("file:///v2h1.ets", [
        "@ComponentV2",
        "struct V2Comp {",
        "  @Local count: number = 0",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      const hover = buildHover(doc, { line: 2, character: 4 });
      expect(hover).not.toBeNull();
      const value = (hover!.contents as any).value as string;
      expect(value).toContain("@Local");
      expect(value).toMatch(/local.*state|internal.*state|component.*internal/i);
    });

    it("shows @Param description in member hover", () => {
      const doc = makeDoc("file:///v2h2.ets", [
        "@ComponentV2",
        "struct V2Comp {",
        "  @Param title: string = ''",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      const hover = buildHover(doc, { line: 2, character: 4 });
      expect(hover).not.toBeNull();
      const value = (hover!.contents as any).value as string;
      expect(value).toContain("@Param");
      expect(value).toMatch(/one.?way|parent.*child|V2.*param/i);
    });

    it("shows @Event description in member hover", () => {
      const doc = makeDoc("file:///v2h3.ets", [
        "@ComponentV2",
        "struct V2Comp {",
        "  @Event onChange: () => void = () => {}",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      const hover = buildHover(doc, { line: 2, character: 4 });
      expect(hover).not.toBeNull();
      const value = (hover!.contents as any).value as string;
      expect(value).toContain("@Event");
      expect(value).toMatch(/child.*parent|event|callback/i);
    });

    it("shows @Trace description in member hover", () => {
      const doc = makeDoc("file:///v2h4.ets", [
        "@ObservedV2",
        "class DataModel {",
        "  @Trace name: string = ''",
        "}",
      ].join("\n"));

      const hover = buildHover(doc, { line: 2, character: 4 });
      expect(hover).not.toBeNull();
      const value = (hover!.contents as any).value as string;
      expect(value).toContain("@Trace");
      expect(value).toMatch(/fine.?grained|reactivity|observed/i);
    });
  });

  describe("hover for @Monitor decorator", () => {
    it("shows @Monitor hover with observed fields and callback name", () => {
      const doc = makeDoc("file:///v2h5.ets", [
        "@ComponentV2",
        "struct MonitorComp {",
        "  @Local count: number = 0",
        "  @Monitor('count') onCountChange(mon: IMonitor) {}",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      // Hover over @Monitor line
      const hover = buildHover(doc, { line: 3, character: 2 });
      expect(hover).not.toBeNull();
      const value = (hover!.contents as any).value as string;
      expect(value).toContain("@Monitor");
      expect(value).toContain("onCountChange");
      expect(value).toContain("count");
    });
  });

  describe("hover for @Provider/@Consumer decorators", () => {
    it("shows @Provider hover with key alias", () => {
      const doc = makeDoc("file:///v2h6.ets", [
        "@ComponentV2",
        "struct ProviderComp {",
        "  @Provider('storeKey') data: number = 0",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      const hover = buildHover(doc, { line: 2, character: 2 });
      expect(hover).not.toBeNull();
      const value = (hover!.contents as any).value as string;
      expect(value).toContain("@Provider");
      expect(value).toContain("storeKey");
    });

    it("shows @Consumer hover with key alias", () => {
      const doc = makeDoc("file:///v2h7.ets", [
        "@ComponentV2",
        "struct ConsumerComp {",
        "  @Consumer('storeKey') received: number = 0",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      const hover = buildHover(doc, { line: 2, character: 2 });
      expect(hover).not.toBeNull();
      const value = (hover!.contents as any).value as string;
      expect(value).toContain("@Consumer");
      expect(value).toContain("storeKey");
    });
  });

  describe("hover for @Computed decorator", () => {
    it("shows @Computed hover with getter info", () => {
      const doc = makeDoc("file:///v2h8.ets", [
        "@ComponentV2",
        "struct CompComp {",
        "  @Local count: number = 0",
        "  @Computed get doubleCount(): number { return this.count * 2 }",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      // Hover over @Computed line
      const hover = buildHover(doc, { line: 3, character: 2 });
      expect(hover).not.toBeNull();
      const value = (hover!.contents as any).value as string;
      expect(value).toContain("@Computed");
      expect(value).toMatch(/computed|getter|derived/i);
    });
  });

  describe("hover for @ComponentV2 and @ObservedV2", () => {
    it("shows @ComponentV2 in struct hover", () => {
      const doc = makeDoc("file:///v2h9.ets", [
        "@ComponentV2",
        "struct V2Comp {",
        "  @Local count: number = 0",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      // Hover over struct name
      const hover = buildHover(doc, { line: 1, character: 7 });
      expect(hover).not.toBeNull();
      const value = (hover!.contents as any).value as string;
      expect(value).toContain("ComponentV2");
    });
  });
});
