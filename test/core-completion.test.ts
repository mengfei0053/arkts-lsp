import { describe, expect, it } from "vitest";
import { CompletionItemKind, Position } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  buildClassMemberCompletionItems,
  buildCompletionItems,
  buildImportCompletionItems,
  buildNamedImportCompletionItems,
  buildSignatureHelp,
  collectExportedSymbolLocations,
  collectImportBindings,
  findLinkedReferences,
  getCallContextAtPosition,
  getImportBindingAtPosition,
  getImportContextAtPosition,
  getMemberAccessContextAtPosition,
  getNamedImportContextAtPosition,
} from "../src/core.js";

function makeDocument(uri: string, text: string): TextDocument {
  return TextDocument.create(uri, "arkts", 1, text);
}

describe("buildCompletionItems", () => {
  it("suggests ArkTS keywords and workspace symbols by prefix", () => {
    const first = makeDocument("file:///first.ets", "struct HomePage {}");
    const second = makeDocument("file:///second.ets", "const helperValue = 1;\nhel");

    const items = buildCompletionItems([first, second], second, Position.create(1, 3));

    expect(items.some((item) => item.label === "helperValue" && item.kind === CompletionItemKind.Variable)).toBe(true);
  });

  it("includes decorator completions when typing @", () => {
    const document = makeDocument("file:///entry.ets", "@");

    const items = buildCompletionItems([document], document, Position.create(0, 1));

    expect(items.some((item) => item.label === "@Entry")).toBe(true);
    expect(items.some((item) => item.label === "@Component")).toBe(true);
  });

  it("builds class member completion items for static methods and fields", () => {
    const document = makeDocument(
      "file:///encode.ts",
      [
        "export class Encode {",
        "  static readonly TAG = 'encode';",
        "  static toHex(arr: Uint8Array): string { return ''; }",
        "  private static toAscii(arr: Uint8Array): string { return ''; }",
        "}",
      ].join("\n"),
    );

    const items = buildClassMemberCompletionItems(document, "Encode", "to");

    expect(items.map((item) => item.label)).toEqual(["toHex", "toAscii"]);
    expect(items.every((item) => item.kind === CompletionItemKind.Method)).toBe(true);
  });

  it("builds signature help for imported class methods", () => {
    const exported = makeDocument("file:///encode.ts", "export class Encode {\n  static encodeUtf8(s: string): Uint8Array { return new Uint8Array(); }\n}");
    const importer = makeDocument("file:///entry.ets", "import { Encode } from './encode';\nEncode.encodeUtf8(cmd");

    const signature = buildSignatureHelp([exported, importer], importer, Position.create(1, 21), (documentUri, specifier) => {
      if (documentUri === importer.uri && specifier === "./encode") {
        return exported;
      }
      return null;
    });

    expect(signature?.signatures[0].label).toBe("Encode.encodeUtf8(s: string): Uint8Array");
    expect(signature?.activeParameter).toBe(0);
  });

  it("tracks the active parameter for top-level function calls", () => {
    const document = makeDocument("file:///entry.ets", "export function sum(a: number, b: number): number { return a + b; }\nsum(first, second");

    const signature = buildSignatureHelp([document], document, Position.create(1, 17), () => null);

    expect(signature?.signatures[0].label).toBe("sum(a: number, b: number): number");
    expect(signature?.activeParameter).toBe(1);
  });
});

describe("import helpers", () => {
  it("collects named import bindings including aliases", () => {
    const document = makeDocument("file:///entry.ets", 'import { helper, format as formatValue } from "./utils";');

    const bindings = collectImportBindings(document);

    expect(bindings).toHaveLength(2);
    expect(bindings[0]).toMatchObject({
      importedName: "helper",
      localName: "helper",
      specifier: "./utils",
    });
    expect(bindings[1]).toMatchObject({
      importedName: "format",
      localName: "formatValue",
      specifier: "./utils",
    });
  });

  it("finds the import binding under the cursor", () => {
    const document = makeDocument("file:///entry.ets", 'import { format as formatValue } from "./utils";');

    const binding = getImportBindingAtPosition(document, Position.create(0, 22));

    expect(binding).toMatchObject({
      importedName: "format",
      localName: "formatValue",
      specifier: "./utils",
    });
  });

  it("detects when the cursor is inside an import specifier", () => {
    const document = makeDocument("file:///entry.ets", 'import { Encode } from "./Encode";');

    const context = getImportContextAtPosition(document, Position.create(0, 27));

    expect(context?.specifier).toBe("./Encode");
  });

  it("detects when the cursor is inside named import bindings", () => {
    const document = makeDocument("file:///entry.ets", 'import { hel } from "./helper";');

    const context = getNamedImportContextAtPosition(document, Position.create(0, 12));

    expect(context?.specifier).toBe("./helper");
    expect(context?.importedPrefix).toBe("hel");
  });

  it("detects member access contexts for completion", () => {
    const document = makeDocument("file:///entry.ets", "Encode.to");

    const context = getMemberAccessContextAtPosition(document, Position.create(0, 9));

    expect(context?.receiver).toBe("Encode");
    expect(context?.prefix).toBe("to");
  });

  it("detects call contexts for signature help", () => {
    const document = makeDocument("file:///entry.ets", "Encode.encodeUtf8(cmd, more");

    const context = getCallContextAtPosition(document, Position.create(0, 26));

    expect(context?.callee).toBe("Encode.encodeUtf8");
    expect(context?.argumentIndex).toBe(1);
  });

  it("builds file completion items for import suggestions", () => {
    const items = buildImportCompletionItems(["./Encode", "../util/helper"]);

    expect(items.map((item) => item.label)).toEqual(["./Encode", "../util/helper"]);
  });

  it("builds named import completion items from exported symbols", () => {
    const document = makeDocument("file:///entry.ets", 'import { hel } from "./helper";');
    const target = makeDocument("file:///helper.ts", "export function helper() {}\nexport const helloValue = 1;\nconst hidden = true;");

    const items = buildNamedImportCompletionItems(document, Position.create(0, 11), target);

    expect(items.map((item) => item.label)).toEqual(["helper", "helloValue"]);
  });

  it("collects exported symbol locations by exported name", () => {
    const document = makeDocument(
      "file:///helper.ts",
      ["export function helper() {}", "export class HelperService {}", "const hidden = true;"].join("\n"),
    );

    const exports = collectExportedSymbolLocations(document);

    expect(exports.get("helper")).toHaveLength(1);
    expect(exports.get("HelperService")).toHaveLength(1);
    expect(exports.has("hidden")).toBe(false);
  });

  it("finds linked references from an imported alias back to the exported symbol", () => {
    const exported = makeDocument("file:///helper.ts", "export function helper() {}\nhelper();");
    const importer = makeDocument("file:///home.ets", "import { helper as loadHelper } from './helper';\nloadHelper();");
    const documents = [exported, importer];

    const references = findLinkedReferences(documents, importer, Position.create(1, 3), true, (documentUri, specifier) => {
      if (documentUri === importer.uri && specifier === "./helper") {
        return exported;
      }
      return null;
    });

    expect(references).toHaveLength(4);
    expect(references.map((location) => location.uri)).toEqual([
      "file:///helper.ts",
      "file:///helper.ts",
      "file:///home.ets",
      "file:///home.ets",
    ]);
  });

  it("can omit only the exported declaration from linked references", () => {
    const exported = makeDocument("file:///helper.ts", "export function helper() {}\nhelper();");
    const importer = makeDocument("file:///home.ets", "import { helper as loadHelper } from './helper';\nloadHelper();");
    const documents = [exported, importer];

    const references = findLinkedReferences(documents, exported, Position.create(0, 17), false, (documentUri, specifier) => {
      if (documentUri === importer.uri && specifier === "./helper") {
        return exported;
      }
      return null;
    });

    expect(references).toHaveLength(3);
    expect(references.every((location) => !(location.uri === "file:///helper.ts" && location.range.start.line === 0))).toBe(true);
  });
});
