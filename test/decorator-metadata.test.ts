import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  parseArkTS,
  getStructDeclarations,
  getClassBodyMembers,
  getWatchDecorators,
  getDecoratorInfo,
} from "../src/parser.js";

function makeDoc(uri: string, text: string): TextDocument {
  return TextDocument.create(uri, "arkts", 1, text);
}

describe("P1-1: decorator metadata extraction", () => {
  describe("getWatchDecorators", () => {
    it("extracts @Watch callback name from @State field", () => {
      const doc = makeDoc("file:///w1.ets", [
        "@Component",
        "struct MyComp {",
        "  @State @Watch('onCountChange') count: number = 0",
        "  onCountChange(newValue: number) {",
        "    console.log(newValue)",
        "  }",
        "  build() {",
        "    Column() {}",
        "  }",
        "}",
      ].join("\n"));

      const tree = parseArkTS(doc);
      expect(tree).not.toBeNull();

      const watches = getWatchDecorators(tree!);
      expect(watches.length).toBe(1);
      expect(watches[0].callbackName).toBe("onCountChange");
      expect(watches[0].fieldName).toBe("count");
      expect(watches[0].structName).toBe("MyComp");
    });

    it("extracts multiple @Watch decorators", () => {
      const doc = makeDoc("file:///w2.ets", [
        "@Component",
        "struct Multi {",
        "  @State @Watch('onName') name: string = ''",
        "  @State @Watch('onAge') age: number = 0",
        "  onName() {}",
        "  onAge() {}",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      const tree = parseArkTS(doc);
      const watches = getWatchDecorators(tree!);
      expect(watches.length).toBe(2);
      expect(watches.map(w => w.callbackName).sort()).toEqual(["onAge", "onName"]);
    });

    it("returns empty for no @Watch", () => {
      const doc = makeDoc("file:///w3.ets", [
        "@Component",
        "struct NoWatch {",
        "  @State count: number = 0",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      const tree = parseArkTS(doc);
      expect(getWatchDecorators(tree!)).toEqual([]);
    });
  });

  describe("getDecoratorInfo", () => {
    it("extracts @Prop field info", () => {
      const doc = makeDoc("file:///d1.ets", [
        "@Component",
        "struct Child {",
        "  @Prop title: string = ''",
        "  @Link count: number",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      const tree = parseArkTS(doc);
      const structs = getStructDeclarations(tree!);
      const child = structs.find(s => s.name === "Child")!;
      const members = getClassBodyMembers(tree!, child);

      const propField = members.fields.find(f => f.name === "title");
      expect(propField).toBeDefined();
      expect(propField!.decorator).toBe("Prop");

      const linkField = members.fields.find(f => f.name === "count");
      expect(linkField).toBeDefined();
      expect(linkField!.decorator).toBe("Link");
    });

    it("extracts decorator arguments from call-style decorators", () => {
      const doc = makeDoc("file:///d2.ets", [
        "@Component",
        "struct Comp {",
        "  @State @Watch('onChange') value: number = 0",
        "  onChange() {}",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      const tree = parseArkTS(doc);
      const info = getDecoratorInfo(tree!);
      console.log("Decorator info:", JSON.stringify(info, null, 2));
      // Should find the Watch decorator with its argument
      const watchInfo = info.find(d => d.name === "Watch");
      expect(watchInfo).toBeDefined();
      expect(watchInfo!.arguments).toContain("onChange");
    });
  });
});
