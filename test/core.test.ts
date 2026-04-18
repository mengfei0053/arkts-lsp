import { describe, expect, it } from "vitest";
import { CompletionItemKind, Position, SymbolKind } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  buildCompletionItems,
  buildImportCompletionItems,
  buildHover,
  buildLinkedRenameEdit,
  buildRenameEdit,
  collectDiagnostics,
  collectDocumentSymbols,
  collectExportedSymbolLocations,
  collectImportBindings,
  collectWorkspaceSymbols,
  findDefinitions,
  findDocumentHighlights,
  findLinkedReferences,
  findReferences,
  findReferencesWithOptions,
  getImportBindingAtPosition,
  getImportContextAtPosition,
  getWordAtPosition,
} from "../src/core.js";

function makeDocument(uri: string, text: string): TextDocument {
  return TextDocument.create(uri, "arkts", 1, text);
}

describe("collectDiagnostics", () => {
  it("reports TODO markers and any usage", () => {
    const document = makeDocument(
      "file:///entry.ets",
      ["// TODO: revisit this", "const name: any = getValue();"].join("\n"),
    );

    const diagnostics = collectDiagnostics(document, { maxNumberOfProblems: 10 });

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0].message).toContain("TODO");
    expect(diagnostics[1].message).toContain("Avoid `any`");
  });

  it("respects the max problem limit", () => {
    const document = makeDocument(
      "file:///entry.ets",
      ["// TODO one", "// TODO two", "const value: any = 1;"].join("\n"),
    );

    const diagnostics = collectDiagnostics(document, { maxNumberOfProblems: 2 });

    expect(diagnostics).toHaveLength(2);
  });
});

describe("collectDocumentSymbols", () => {
  it("extracts ArkTS and TypeScript declarations", () => {
    const document = makeDocument(
      "file:///entry.ets",
      [
        "@Entry",
        "struct HomePage {",
        "}",
        "export function loadData() {}",
        "const count = 1;",
        "interface UserProfile {}",
      ].join("\n"),
    );

    const symbols = collectDocumentSymbols(document);

    expect(symbols.map((symbol) => symbol.name)).toEqual(["HomePage", "loadData", "count", "UserProfile"]);
    expect(symbols[0].kind).toBe(SymbolKind.Class);
    expect(symbols[0].containerName).toBe("Entry");
    expect(symbols[1].kind).toBe(SymbolKind.Function);
  });
});

describe("getWordAtPosition", () => {
  it("returns the identifier under the cursor", () => {
    const document = makeDocument("file:///entry.ets", "const greetingMessage = formatGreeting(user);");

    const word = getWordAtPosition(document, Position.create(0, 8));

    expect(word).toBe("greetingMessage");
  });

  it("returns null when the cursor is on whitespace", () => {
    const document = makeDocument("file:///entry.ets", "const value = 1;");

    const word = getWordAtPosition(document, Position.create(0, 13));

    expect(word).toBeNull();
  });
});

describe("workspace navigation helpers", () => {
  it("finds workspace symbols by query", () => {
    const first = makeDocument("file:///first.ets", "struct HomePage {}");
    const second = makeDocument("file:///second.ets", "export function loadProfile() {}");

    const symbols = collectWorkspaceSymbols([first, second], "profile");

    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe("loadProfile");
  });

  it("prefers same-document definitions before workspace matches", () => {
    const first = makeDocument(
      "file:///first.ets",
      ["export function loadProfile() {}", "const value = loadProfile();"].join("\n"),
    );
    const second = makeDocument("file:///second.ets", "export function loadProfile() {}");

    const definitions = findDefinitions(
      {
        document: first,
        symbols: [first, second].flatMap((document) => collectDocumentSymbols(document)),
      },
      Position.create(1, 20),
    );

    expect(definitions).toHaveLength(2);
    expect(definitions[0].uri).toBe("file:///first.ets");
    expect(definitions[1].uri).toBe("file:///second.ets");
  });

  it("finds references across open documents", () => {
    const first = makeDocument(
      "file:///first.ets",
      ["export function loadProfile() {}", "const value = loadProfile();"].join("\n"),
    );
    const second = makeDocument("file:///second.ets", "loadProfile();");

    const references = findReferences([first, second], first, Position.create(1, 20));

    expect(references).toHaveLength(3);
    expect(references.map((location) => location.uri)).toEqual([
      "file:///first.ets",
      "file:///first.ets",
      "file:///second.ets",
    ]);
  });

  it("can exclude declarations from reference results", () => {
    const first = makeDocument(
      "file:///first.ets",
      ["export function loadProfile() {}", "const value = loadProfile();"].join("\n"),
    );
    const second = makeDocument("file:///second.ets", "loadProfile();");

    const references = findReferencesWithOptions([first, second], first, Position.create(1, 20), false);

    expect(references).toHaveLength(2);
    expect(references.every((location) => !(location.uri === "file:///first.ets" && location.range.start.line === 0))).toBe(true);
  });

  it("finds highlights within the current document", () => {
    const document = makeDocument(
      "file:///first.ets",
      ["export function loadProfile() {}", "const value = loadProfile();", "loadProfile();"].join("\n"),
    );

    const highlights = findDocumentHighlights(document, Position.create(1, 20));

    expect(highlights).toHaveLength(3);
    expect(highlights[0].kind).toBeDefined();
  });

  it("builds a workspace edit for renaming references", () => {
    const first = makeDocument(
      "file:///first.ets",
      ["export function loadProfile() {}", "const value = loadProfile();"].join("\n"),
    );
    const second = makeDocument("file:///second.ets", "loadProfile();");

    const edit = buildRenameEdit([first, second], first, Position.create(1, 20), "loadAccount");

    expect(edit).not.toBeNull();
    expect(edit?.changes?.["file:///first.ets"]).toHaveLength(2);
    expect(edit?.changes?.["file:///second.ets"]).toHaveLength(1);
    expect(edit?.changes?.["file:///first.ets"]?.[0].newText).toBe("loadAccount");
  });

  it("renames an exported symbol across import bindings and same-name usages", () => {
    const exported = makeDocument("file:///helper.ts", "export function helper() {}\nhelper();");
    const importer = makeDocument("file:///home.ets", "import { helper } from './helper';\nhelper();");
    const documents = [exported, importer];

    const edit = buildLinkedRenameEdit(documents, exported, Position.create(0, 17), "loadHelper", (documentUri, specifier) => {
      if (documentUri === importer.uri && specifier === "./helper") {
        return exported;
      }

      return null;
    });

    expect(edit).not.toBeNull();
    expect(edit?.changes?.["file:///helper.ts"]).toHaveLength(2);
    expect(edit?.changes?.["file:///home.ets"]).toHaveLength(2);
    expect(edit?.changes?.["file:///home.ets"]?.every((entry) => entry.newText === "loadHelper")).toBe(true);
  });

  it("renames only the local alias chain when the cursor is on an aliased import", () => {
    const exported = makeDocument("file:///helper.ts", "export function helper() {}\nhelper();");
    const importer = makeDocument("file:///home.ets", "import { helper as loadHelper } from './helper';\nloadHelper();");
    const documents = [exported, importer];

    const edit = buildLinkedRenameEdit(documents, importer, Position.create(0, 21), "runHelper", (documentUri, specifier) => {
      if (documentUri === importer.uri && specifier === "./helper") {
        return exported;
      }

      return null;
    });

    expect(edit).not.toBeNull();
    expect(edit?.changes?.["file:///home.ets"]).toHaveLength(2);
    expect(edit?.changes?.["file:///helper.ts"]).toBeUndefined();
    expect(edit?.changes?.["file:///home.ets"]?.every((entry) => entry.newText === "runHelper")).toBe(true);
  });
});

describe("buildHover", () => {
  it("returns formatted hover information for the current line", () => {
    const document = makeDocument("file:///entry.ets", "const profileName = user.name;");

    const hover = buildHover(document, Position.create(0, 10));

    expect(hover).not.toBeNull();
    const contents = hover?.contents;
    expect(typeof contents === "object" && "value" in contents ? contents.value : "").toContain("profileName");
  });
});

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

  it("builds file completion items for import suggestions", () => {
    const items = buildImportCompletionItems(["./Encode", "../util/helper"]);

    expect(items.map((item) => item.label)).toEqual(["./Encode", "../util/helper"]);
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
