import { describe, expect, it } from "vitest";
import { Position, TextDocumentSyncKind } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  buildFoldingRanges,
  buildSelectionRangeResponse,
  buildSelectionRanges,
  buildServerCapabilities,
} from "../src/core.js";

function makeDocument(uri: string, text: string): TextDocument {
  return TextDocument.create(uri, "arkts", 1, text);
}

describe("buildFoldingRanges", () => {
  it("collects multi-line brace blocks without folding single-line literals", () => {
    const document = makeDocument(
      "file:///entry.ets",
      [
        "@Component",
        "export struct HomePage {",
        "  build() {",
        "    if (isReady) {",
        "      return Column()",
        "        .width('100%');",
        "    }",
        "  }",
        "}",
        "export function helper() {",
        "  const value = { enabled: true };",
        "  return value;",
        "}",
      ].join("\n"),
    );

    expect(buildFoldingRanges(document)).toEqual([
      { startLine: 1, endLine: 8 },
      { startLine: 2, endLine: 7 },
      { startLine: 3, endLine: 6 },
      { startLine: 9, endLine: 12 },
    ]);
  });

  it("ignores braces inside regular expression literals", () => {
    const document = makeDocument(
      "file:///entry.ts",
      [
        "export function helper() {",
        "  const matcher = /{/;",
        "  if (isReady) {",
        "    return 1;",
        "  }",
        "}",
      ].join("\n"),
    );

    expect(buildFoldingRanges(document)).toEqual([
      { startLine: 0, endLine: 5 },
      { startLine: 2, endLine: 4 },
    ]);
  });

  it("keeps block folding stable when a regex literal follows return", () => {
    const document = makeDocument(
      "file:///entry.ts",
      [
        "export function helper() {",
        "  if (isReady) {",
        "    return /{/;",
        "  }",
        "}",
      ].join("\n"),
    );

    expect(buildFoldingRanges(document)).toEqual([
      { startLine: 0, endLine: 4 },
      { startLine: 1, endLine: 3 },
    ]);
  });

  it("keeps block folding stable after strings ending with escaped backslashes", () => {
    const document = makeDocument(
      "file:///entry.ts",
      [
        "export function helper() {",
        '  const value = "a\\\\";',
        "  if (isReady) {",
        "    return 1;",
        "  }",
        "}",
      ].join("\n"),
    );

    expect(buildFoldingRanges(document)).toEqual([
      { startLine: 0, endLine: 5 },
      { startLine: 2, endLine: 4 },
    ]);
  });

  it("does not treat division after postfix increment as a regex literal", () => {
    const document = makeDocument(
      "file:///entry.ts",
      [
        "export function helper() {",
        "  let count = 1;",
        "  const next = count++ / 2;",
        "  if (next > 0) {",
        "    return next;",
        "  }",
        "}",
      ].join("\n"),
    );

    expect(buildFoldingRanges(document)).toEqual([
      { startLine: 0, endLine: 6 },
      { startLine: 3, endLine: 5 },
    ]);
  });

  it("keeps folding stable when regex literals follow control-flow keywords", () => {
    const elseDocument = makeDocument(
      "file:///else.ts",
      [
        "export function helper(value: string) {",
        "  if (value) {",
        "    return value;",
        "  } else /{/.test(value);",
        "}",
      ].join("\n"),
    );

    const doDocument = makeDocument(
      "file:///do.ts",
      [
        "export function helper(value: string) {",
        "  do /{/.test(value); while (value.length > 0);",
        "}",
      ].join("\n"),
    );

    expect(buildFoldingRanges(elseDocument)).toEqual([
      { startLine: 0, endLine: 4 },
      { startLine: 1, endLine: 3 },
    ]);
    expect(buildFoldingRanges(doDocument)).toEqual([{ startLine: 0, endLine: 2 }]);
  });
});

describe("buildSelectionRanges", () => {
  it("builds nested selections from identifier to enclosing blocks", () => {
    const document = makeDocument(
      "file:///entry.ets",
      [
        "@Component",
        "export struct HomePage {",
        "  build() {",
        "    if (isReady) {",
        "      return this.count + total;",
        "    }",
        "  }",
        "}",
      ].join("\n"),
    );

    expect(buildSelectionRanges(document, [Position.create(4, 20)])).toEqual([
      {
        range: {
          start: { line: 4, character: 18 },
          end: { line: 4, character: 23 },
        },
        parent: {
          range: {
            start: { line: 4, character: 13 },
            end: { line: 4, character: 31 },
          },
          parent: {
            range: {
              start: { line: 4, character: 6 },
              end: { line: 4, character: 32 },
            },
            parent: {
              range: {
                start: { line: 3, character: 4 },
                end: { line: 5, character: 5 },
              },
              parent: {
                range: {
                  start: { line: 2, character: 2 },
                  end: { line: 6, character: 3 },
                },
                parent: {
                  range: {
                    start: { line: 1, character: 0 },
                    end: { line: 7, character: 1 },
                  },
                },
              },
            },
          },
        },
      },
    ]);
  });

  it("returns one placeholder selection per position when the document is unavailable", () => {
    const positions = [Position.create(1, 2), Position.create(3, 4)];

    expect(buildSelectionRangeResponse(null, positions)).toEqual([
      {
        range: {
          start: { line: 1, character: 2 },
          end: { line: 1, character: 2 },
        },
      },
      {
        range: {
          start: { line: 3, character: 4 },
          end: { line: 3, character: 4 },
        },
      },
    ]);
  });
});

describe("buildServerCapabilities", () => {
  it("advertises selection range support alongside existing capabilities", () => {
    expect(buildServerCapabilities()).toMatchObject({
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      documentHighlightProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      foldingRangeProvider: true,
      selectionRangeProvider: true,
      renameProvider: { prepareProvider: false },
      documentLinkProvider: { resolveProvider: false },
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [".", "@", ":"],
      },
      signatureHelpProvider: {
        triggerCharacters: ["(", ","],
      },
    });
  });
});
