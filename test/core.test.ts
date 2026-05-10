import { describe, expect, it } from "vitest";
import { Position, SymbolKind } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  buildHover,
  buildLinkedHover,
  buildRenameEdit,
  collectDiagnostics,
  collectDocumentSymbols,
  collectExportedSymbolLocations,
  collectWorkspaceSymbols,
  findDefinitions,
  findDocumentHighlights,
  findReferences,
  findReferencesWithOptions,
  getWordAtPosition,
  buildLinkedRenameEdit,
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

  it("does not report any diagnostics for comment-only any text", () => {
    const document = makeDocument(
      "file:///entry.ets",
      ["// TODO keep tracking", "// const fake: any = value;"].join("\n"),
    );

    const diagnostics = collectDiagnostics(document, { maxNumberOfProblems: 10 });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("TODO");
  });
});

describe("collectDocumentSymbols", () => {
  it("extracts ArkTS and TypeScript declarations", () => {
    const document = makeDocument(
      "file:///entry.ets",
      [
        "@Entry",
        "@Component export struct HomePage {",
        "}",
        "export default struct SplashPage {}",
        "export function loadData() {}",
        "const count = 1;",
        "interface UserProfile {}",
      ].join("\n"),
    );

    const symbols = collectDocumentSymbols(document);

    expect(symbols.map((symbol) => symbol.name)).toEqual(["HomePage", "SplashPage", "loadData", "count", "UserProfile"]);
    expect(symbols[0].kind).toBe(SymbolKind.Class);
    expect(symbols[0].containerName).toBe("Component");
    expect(symbols[1].kind).toBe(SymbolKind.Class);
    expect(symbols[1].containerName).toBeUndefined();
    expect(symbols[2].kind).toBe(SymbolKind.Function);
  });

  it("extracts multiple top-level declarations from the same line", () => {
    const document = makeDocument(
      "file:///inline.ets",
      "export function alpha() {} export function beta() {} const gamma = 1;",
    );

    const symbols = collectDocumentSymbols(document);

    expect(symbols.map((symbol) => symbol.name)).toEqual(["alpha", "beta", "gamma"]);
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

  it("finds local definitions for decorated ArkTS component fields before workspace matches", () => {
    const component = makeDocument(
      "file:///home.ets",
      [
        "@Component",
        "export struct HomePage {",
        "  @State count: number = 0;",
        "  build() {",
        "    return this.count;",
        "  }",
        "}",
      ].join("\n"),
    );
    const helper = makeDocument("file:///helper.ts", "export const count = 1;");

    const definitions = findDefinitions(
      {
        document: component,
        symbols: [component, helper].flatMap((document) => collectDocumentSymbols(document)),
      },
      Position.create(4, 16),
    );

    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toMatchObject({
      uri: "file:///home.ets",
      range: {
        start: { line: 2, character: 9 },
        end: { line: 2, character: 14 },
      },
    });
  });

  it("resolves @Consume fields to matching @Provide definitions across documents", () => {
    const provider = makeDocument(
      "file:///provider.ets",
      [
        "struct Parent {",
        "  @Provide sharedCount: number = 0;",
        "  build() {}",
        "}",
      ].join("\n"),
    );
    const consumer = makeDocument(
      "file:///consumer.ets",
      [
        "struct Child {",
        "  @Consume sharedCount: number;",
        "  build() {",
        "    return this.sharedCount;",
        "  }",
        "}",
      ].join("\n"),
    );

    const definitions = findDefinitions(
      {
        document: consumer,
        documents: [provider, consumer],
        symbols: [provider, consumer].flatMap((document) => collectDocumentSymbols(document)),
      },
      Position.create(3, 17),
    );

    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toMatchObject({
      uri: "file:///provider.ets",
      range: {
        start: { line: 1, character: 11 },
        end: { line: 1, character: 22 },
      },
    });
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

  it("finds references for @Provide/@Consume linked state across documents", () => {
    const provider = makeDocument(
      "file:///provider.ets",
      [
        "struct Parent {",
        "  @Provide sharedCount: number = 0;",
        "  build() {}",
        "}",
      ].join("\n"),
    );
    const consumer = makeDocument(
      "file:///consumer.ets",
      [
        "struct Child {",
        "  @Consume sharedCount: number;",
        "  build() {",
        "    return this.sharedCount;",
        "  }",
        "}",
      ].join("\n"),
    );

    const references = findReferences([provider, consumer], provider, Position.create(1, 15));

    expect(references).toHaveLength(3);
    expect(references.map((location) => location.uri)).toEqual([
      "file:///provider.ets",
      "file:///consumer.ets",
      "file:///consumer.ets",
    ]);
  });

  it("finds the same linked state references when starting from the consumer side", () => {
    const provider = makeDocument(
      "file:///provider.ets",
      [
        "struct Parent {",
        "  @Provide sharedCount: number = 0;",
        "  build() {}",
        "}",
      ].join("\n"),
    );
    const consumer = makeDocument(
      "file:///consumer.ets",
      [
        "struct Child {",
        "  @Consume sharedCount: number;",
        "  build() {",
        "    return this.sharedCount;",
        "  }",
        "}",
      ].join("\n"),
    );

    const references = findReferences([provider, consumer], consumer, Position.create(3, 17));

    expect(references).toHaveLength(3);
    expect(references.map((location) => location.uri)).toEqual([
      "file:///provider.ets",
      "file:///consumer.ets",
      "file:///consumer.ets",
    ]);
  });

  it("finds references for decorated ArkTS component fields without unrelated workspace matches", () => {
    const component = makeDocument(
      "file:///home.ets",
      [
        "@Component",
        "export struct HomePage {",
        "  @State count: number = 0;",
        "  build() {",
        "    return this.count + this.count;",
        "  }",
        "}",
      ].join("\n"),
    );
    const helper = makeDocument("file:///helper.ts", "export const count = 1;\ncount;");

    const references = findReferences([component, helper], component, Position.create(4, 16));

    expect(references).toHaveLength(3);
    expect(references.every((location) => location.uri === "file:///home.ets")).toBe(true);
  });

  it("resolves @ObjectLink fields to matching @Observed type definitions across documents", () => {
    const observed = makeDocument(
      "file:///model.ets",
      [
        "@Observed",
        "export class FormState {",
        "  value: number = 0;",
        "}",
      ].join("\n"),
    );
    const viewer = makeDocument(
      "file:///viewer.ets",
      [
        "struct Viewer {",
        "  @ObjectLink form: FormState;",
        "  build() {",
        "    return this.form.value;",
        "  }",
        "}",
      ].join("\n"),
    );

    const definitions = findDefinitions(
      {
        document: viewer,
        documents: [observed, viewer],
        symbols: [observed, viewer].flatMap((document) => collectDocumentSymbols(document)),
      },
      Position.create(1, 16),
    );

    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toMatchObject({
      uri: "file:///model.ets",
      range: {
        start: { line: 1, character: 13 },
        end: { line: 1, character: 22 },
      },
    });
  });

  it("includes @Observed type declarations in @ObjectLink references", () => {
    const observed = makeDocument(
      "file:///model.ets",
      [
        "@Observed",
        "export class FormState {",
        "  value: number = 0;",
        "}",
      ].join("\n"),
    );
    const viewer = makeDocument(
      "file:///viewer.ets",
      [
        "struct Viewer {",
        "  @ObjectLink form: FormState;",
        "  build() {",
        "    return this.form.value;",
        "  }",
        "}",
      ].join("\n"),
    );

    const references = findReferences([observed, viewer], viewer, Position.create(3, 16));

    expect(references.some((location) => location.uri === "file:///model.ets" && location.range.start.line === 1)).toBe(true);
    expect(references.some((location) => location.uri === "file:///viewer.ets" && location.range.start.line === 1)).toBe(true);
    expect(references.some((location) => location.uri === "file:///viewer.ets" && location.range.start.line === 3)).toBe(true);
  });

  it("includes linked @ObjectLink usages when references start from an @Observed type declaration", () => {
    const observed = makeDocument(
      "file:///model.ets",
      [
        "@Observed",
        "export class FormState {",
        "  value: number = 0;",
        "}",
      ].join("\n"),
    );
    const viewer = makeDocument(
      "file:///viewer.ets",
      [
        "struct Viewer {",
        "  @ObjectLink form: FormState;",
        "  build() {",
        "    return this.form.value;",
        "  }",
        "}",
      ].join("\n"),
    );

    const references = findReferences([observed, viewer], observed, Position.create(1, 15));

    expect(references.some((location) => location.uri === "file:///model.ets" && location.range.start.line === 1)).toBe(true);
    expect(references.some((location) => location.uri === "file:///viewer.ets" && location.range.start.line === 1)).toBe(true);
    expect(references.some((location) => location.uri === "file:///viewer.ets" && location.range.start.line === 3)).toBe(true);
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

  it("renames decorated ArkTS component fields without touching unrelated workspace symbols", () => {
    const component = makeDocument(
      "file:///home.ets",
      [
        "@Component",
        "export struct HomePage {",
        "  @State count: number = 0;",
        "  build() {",
        "    return this.count + this.count;",
        "  }",
        "}",
      ].join("\n"),
    );
    const helper = makeDocument("file:///helper.ts", "export const count = 1;\ncount;");

    const edit = buildRenameEdit([component, helper], component, Position.create(4, 17), "totalCount");

    expect(edit).not.toBeNull();
    expect(edit?.changes?.["file:///home.ets"]).toHaveLength(3);
    expect(edit?.changes?.["file:///helper.ts"]).toBeUndefined();
  });

  it("renames @Provide/@Consume linked state across documents", () => {
    const provider = makeDocument(
      "file:///provider.ets",
      [
        "struct Parent {",
        "  @Provide sharedCount: number = 0;",
        "  build() {}",
        "}",
      ].join("\n"),
    );
    const consumer = makeDocument(
      "file:///consumer.ets",
      [
        "struct Child {",
        "  @Consume sharedCount: number;",
        "  build() {",
        "    return this.sharedCount;",
        "  }",
        "}",
      ].join("\n"),
    );

    const edit = buildRenameEdit([provider, consumer], provider, Position.create(1, 15), "totalCount");

    expect(edit).not.toBeNull();
    expect(edit?.changes?.["file:///provider.ets"]).toHaveLength(1);
    expect(edit?.changes?.["file:///consumer.ets"]).toHaveLength(2);
  });

  it("renames an @Observed type together with linked @ObjectLink annotations without touching unrelated symbols", () => {
    const observed = makeDocument(
      "file:///model.ets",
      [
        "@Observed",
        "export class FormState {",
        "  value: number = 0;",
        "}",
      ].join("\n"),
    );
    const viewer = makeDocument(
      "file:///viewer.ets",
      [
        "struct Viewer {",
        "  @ObjectLink form: FormState;",
        "  build() {",
        "    return this.form.value;",
        "  }",
        "}",
      ].join("\n"),
    );
    const helper = makeDocument(
      "file:///helper.ts",
      [
        "export class FormState {}",
        "const value = new FormState();",
      ].join("\n"),
    );

    const edit = buildRenameEdit([observed, viewer, helper], observed, Position.create(1, 15), "ProfileState");

    expect(edit).not.toBeNull();
    expect(edit?.changes?.["file:///model.ets"]?.some((entry) => entry.newText === "ProfileState")).toBe(true);
    expect(edit?.changes?.["file:///viewer.ets"]?.some((entry) => entry.newText === "ProfileState")).toBe(true);
    expect(edit?.changes?.["file:///helper.ts"]).toBeUndefined();
  });

  it("renames linked @Provide/@Consume state when rename starts from the consumer side", () => {
    const provider = makeDocument(
      "file:///provider.ets",
      [
        "struct Parent {",
        "  @Provide sharedCount: number = 0;",
        "  build() {}",
        "}",
      ].join("\n"),
    );
    const consumer = makeDocument(
      "file:///consumer.ets",
      [
        "struct Child {",
        "  @Consume sharedCount: number;",
        "  build() {",
        "    return this.sharedCount;",
        "  }",
        "}",
      ].join("\n"),
    );

    const edit = buildRenameEdit([provider, consumer], consumer, Position.create(3, 17), "totalCount");

    expect(edit).not.toBeNull();
    expect(edit?.changes?.["file:///provider.ets"]).toHaveLength(1);
    expect(edit?.changes?.["file:///consumer.ets"]).toHaveLength(2);
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

  it("describes decorated ArkTS component fields in hover output", () => {
    const document = makeDocument(
      "file:///entry.ets",
      [
        "@Component",
        "export struct HomePage {",
        "  @State count: number = 0;",
        "  build() {",
        "    return this.count;",
        "  }",
        "}",
      ].join("\n"),
    );

    const hover = buildHover(document, Position.create(4, 16));

    const contents = typeof hover?.contents === "object" && "value" in hover.contents ? hover.contents.value : "";
    expect(contents).toContain("State field");
    expect(contents).toContain("HomePage");
    expect(contents).toContain("count: number");
  });

  it("keeps hover semantics for ArkTS fields decorated on separate lines", () => {
    const document = makeDocument(
      "file:///entry.ets",
      [
        "@Component",
        "export struct HomePage {",
        "  @Prop",
        "  title: string = 'ArkTS';",
        "  build() {",
        "    return this.title;",
        "  }",
        "}",
      ].join("\n"),
    );

    const hover = buildHover(document, Position.create(5, 16));

    const contents = typeof hover?.contents === "object" && "value" in hover.contents ? hover.contents.value : "";
    expect(contents).toContain("Prop field");
    expect(contents).toContain("HomePage");
    expect(contents).toContain("title: string");
  });

  it("describes local function symbols in hover output", () => {
    const document = makeDocument(
      "file:///entry.ets",
      ["export function loadProfile(userId: string): string {", "  return userId;", "}", "loadProfile('1');"].join("\n"),
    );

    const hover = buildHover(document, Position.create(3, 3));

    const contents = typeof hover?.contents === "object" && "value" in hover.contents ? hover.contents.value : "";
    expect(contents).toContain("Function `loadProfile`");
    expect(contents).toContain("Defined in `entry.ets`");
    expect(contents).toContain("export function loadProfile(userId: string): string {");
  });

  it("returns linked hover information for imported aliases", () => {
    const exported = makeDocument("file:///helper.ts", "export function helper() {}");
    const importer = makeDocument("file:///home.ets", "import { helper as loadHelper } from './helper';\nloadHelper();");
    const hover = buildLinkedHover([exported, importer], importer, Position.create(1, 3), (documentUri, specifier) => {
      if (documentUri === importer.uri && specifier === "./helper") {
        return exported;
      }

      return null;
    });

    const contents = typeof hover?.contents === "object" && "value" in hover.contents ? hover.contents.value : "";
    expect(contents).toContain("Alias of `helper`");
    expect(contents).toContain("helper.ts");
  });
});
