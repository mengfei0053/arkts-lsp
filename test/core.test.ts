import { describe, expect, it } from "vitest";
import { Position, SymbolKind } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  buildHover,
  collectDiagnostics,
  collectDocumentSymbols,
  collectWorkspaceSymbols,
  findDefinitions,
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
