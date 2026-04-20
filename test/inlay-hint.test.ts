import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as core from "../src/core.js";

function makeDocument(uri: string, text: string): TextDocument {
  return TextDocument.create(uri, "arkts", 1, text);
}

describe("buildInlayHints", () => {
  it("advertises inlay hint support", () => {
    expect(core.buildServerCapabilities()).toMatchObject({
      inlayHintProvider: true,
    });
  });

  it("builds parameter name hints for local function calls", () => {
    const document = makeDocument(
      "file:///entry.ets",
      [
        "function formatName(first: string, last: string) {",
        "  return `${first} ${last}`;",
        "}",
        "const label = formatName(givenName, familyName);",
      ].join("\n"),
    );

    const buildInlayHints = (
      core as typeof core & {
        buildInlayHints?: (
          documents: TextDocument[],
          document: TextDocument,
          range: { start: { line: number; character: number }; end: { line: number; character: number } },
          resolveImportTarget: (documentUri: string, specifier: string) => TextDocument | null,
        ) => Array<{ position: { line: number; character: number }; label: string }>;
      }
    ).buildInlayHints;

    const hints = buildInlayHints?.([document], document, {
      start: { line: 0, character: 0 },
      end: { line: 3, character: 46 },
    }, () => null);

    expect(hints).toMatchObject([
      {
        position: { line: 3, character: 25 },
        label: "first:",
      },
      {
        position: { line: 3, character: 36 },
        label: "last:",
      },
    ]);
  });

  it("builds parameter name hints for imported function aliases", () => {
    const exported = makeDocument(
      "file:///format.ts",
      [
        "export function formatName(first: string, last: string) {",
        "  return `${first} ${last}`;",
        "}",
      ].join("\n"),
    );
    const importer = makeDocument(
      "file:///entry.ets",
      [
        "import { formatName as makeName } from './format';",
        "const label = makeName(givenName, familyName);",
      ].join("\n"),
    );

    const buildInlayHints = (
      core as typeof core & {
        buildInlayHints?: (
          documents: TextDocument[],
          document: TextDocument,
          range: { start: { line: number; character: number }; end: { line: number; character: number } },
          resolveImportTarget: (documentUri: string, specifier: string) => TextDocument | null,
        ) => Array<{ position: { line: number; character: number }; label: string }>;
      }
    ).buildInlayHints;

    const hints = buildInlayHints?.([exported, importer], importer, {
      start: { line: 0, character: 0 },
      end: { line: 1, character: 42 },
    }, (documentUri, specifier) => {
      if (documentUri === importer.uri && specifier === "./format") {
        return exported;
      }

      return null;
    });

    expect(hints).toMatchObject([
      {
        position: { line: 1, character: 23 },
        label: "first:",
      },
      {
        position: { line: 1, character: 34 },
        label: "last:",
      },
    ]);
  });
});
