import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  parseArkTS,
  getStructDeclarations,
  getMonitorDecorators,
  getProviderConsumerPairs,
  getV2ComponentInfo,
  getComputedMethods,
  getObservedV2Classes,
} from "../src/parser.js";

function makeDoc(uri: string, text: string): TextDocument {
  return TextDocument.create(uri, "arkts", 1, text);
}

describe("P0-V2a: V2 decorator metadata extraction", () => {
  describe("getMonitorDecorators", () => {
    it("extracts @Monitor callback name and observed field names", () => {
      const doc = makeDoc("file:///m1.ets", [
        "@ComponentV2",
        "struct MonitorComp {",
        "  @Local count: number = 0",
        "  @Monitor('count') onCountChange(mon: IMonitor) {}",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      const tree = parseArkTS(doc);
      expect(tree).not.toBeNull();

      const monitors = getMonitorDecorators(tree!);
      expect(monitors.length).toBe(1);
      expect(monitors[0].callbackName).toBe("onCountChange");
      expect(monitors[0].observedFields).toEqual(["count"]);
      expect(monitors[0].structName).toBe("MonitorComp");
    });

    it("extracts @Monitor with multiple observed fields", () => {
      const doc = makeDoc("file:///m2.ets", [
        "@ComponentV2",
        "struct MultiMonitor {",
        "  @Local x: number = 0",
        "  @Local y: number = 0",
        "  @Monitor('x', 'y') onPositionChange(mon: IMonitor) {}",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      const tree = parseArkTS(doc);
      const monitors = getMonitorDecorators(tree!);
      expect(monitors.length).toBe(1);
      expect(monitors[0].observedFields).toEqual(["x", "y"]);
    });

    it("returns empty for no @Monitor", () => {
      const doc = makeDoc("file:///m3.ets", [
        "@ComponentV2",
        "struct NoMonitor {",
        "  @Local count: number = 0",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      const tree = parseArkTS(doc);
      expect(getMonitorDecorators(tree!)).toEqual([]);
    });
  });

  describe("getProviderConsumerPairs", () => {
    it("extracts @Provider and @Consumer with key alias", () => {
      const doc = makeDoc("file:///pc1.ets", [
        "@ComponentV2",
        "struct ProviderComp {",
        "  @Provider('storeKey') data: number = 0",
        "  build() { Column() {} }",
        "}",
        "@ComponentV2",
        "struct ConsumerComp {",
        "  @Consumer('storeKey') received: number = 0",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      const tree = parseArkTS(doc);
      const pairs = getProviderConsumerPairs(tree!);

      const providers = pairs.filter(p => p.kind === "Provider");
      const consumers = pairs.filter(p => p.kind === "Consumer");

      expect(providers.length).toBe(1);
      expect(providers[0].key).toBe("storeKey");
      expect(providers[0].fieldName).toBe("data");
      expect(providers[0].structName).toBe("ProviderComp");

      expect(consumers.length).toBe(1);
      expect(consumers[0].key).toBe("storeKey");
      expect(consumers[0].fieldName).toBe("received");
      expect(consumers[0].structName).toBe("ConsumerComp");
    });

    it("extracts @Provider/@Consumer with default key (field name)", () => {
      const doc = makeDoc("file:///pc2.ets", [
        "@ComponentV2",
        "struct DefaultKey {",
        "  @Provider userInfo: string = ''",
        "  @Consumer userInfo: string = ''",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      const tree = parseArkTS(doc);
      const pairs = getProviderConsumerPairs(tree!);
      // When no explicit key alias, key defaults to field name
      expect(pairs.every(p => p.key === "userInfo")).toBe(true);
    });
  });

  describe("getV2ComponentInfo", () => {
    it("identifies @ComponentV2 structs", () => {
      const doc = makeDoc("file:///v2c1.ets", [
        "@ComponentV2",
        "struct V2Comp {",
        "  @Local count: number = 0",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      const tree = parseArkTS(doc);
      const structs = getStructDeclarations(tree!);
      const v2Info = getV2ComponentInfo(tree!);

      expect(v2Info.length).toBe(1);
      expect(v2Info[0].name).toBe("V2Comp");
      expect(v2Info[0].isV2).toBe(true);
    });

    it("distinguishes V1 @Component from V2 @ComponentV2", () => {
      const doc = makeDoc("file:///v2c2.ets", [
        "@Component",
        "struct V1Comp {",
        "  @State count: number = 0",
        "  build() { Column() {} }",
        "}",
        "@ComponentV2",
        "struct V2Comp {",
        "  @Local count: number = 0",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      const tree = parseArkTS(doc);
      const v2Info = getV2ComponentInfo(tree!);

      expect(v2Info.length).toBe(2);
      const v1 = v2Info.find(v => v.name === "V1Comp");
      const v2 = v2Info.find(v => v.name === "V2Comp");
      expect(v1?.isV2).toBe(false);
      expect(v2?.isV2).toBe(true);
    });
  });

  describe("getComputedMethods", () => {
    it("extracts @Computed getter methods", () => {
      const doc = makeDoc("file:///comp1.ets", [
        "@ComponentV2",
        "struct CompComp {",
        "  @Local count: number = 0",
        "  @Computed get doubleCount(): number { return this.count * 2 }",
        "  build() { Column() {} }",
        "}",
      ].join("\n"));

      const tree = parseArkTS(doc);
      const computed = getComputedMethods(tree!);

      expect(computed.length).toBe(1);
      expect(computed[0].name).toBe("doubleCount");
      expect(computed[0].structName).toBe("CompComp");
      expect(computed[0].isGetter).toBe(true);
    });
  });

  describe("getObservedV2Classes", () => {
    it("identifies @ObservedV2 classes with @Trace fields", () => {
      const doc = makeDoc("file:///obs2.ets", [
        "@ObservedV2",
        "class DataModel {",
        "  @Trace name: string = ''",
        "  @Trace age: number = 0",
        "}",
      ].join("\n"));

      const tree = parseArkTS(doc);
      const classes = getObservedV2Classes(tree!);

      expect(classes.length).toBe(1);
      expect(classes[0].name).toBe("DataModel");
      expect(classes[0].isObservedV2).toBe(true);
      expect(classes[0].traceFields).toEqual(["name", "age"]);
    });
  });
});
