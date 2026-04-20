import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as core from "../src/core.js";

function makeDocument(uri: string, text: string): TextDocument {
  return TextDocument.create(uri, "arkts", 1, text);
}

function decodeSemanticTokens(
  document: TextDocument,
  data: number[],
  legend: { tokenTypes: string[] },
): Array<{ line: number; start: number; length: number; type: string; text: string }> {
  const tokens: Array<{ line: number; start: number; length: number; type: string; text: string }> = [];
  let line = 0;
  let character = 0;

  for (let index = 0; index < data.length; index += 5) {
    line += data[index] ?? 0;
    character = (data[index] ?? 0) === 0 ? character + (data[index + 1] ?? 0) : (data[index + 1] ?? 0);
    const length = data[index + 2] ?? 0;
    const tokenType = legend.tokenTypes[data[index + 3] ?? -1] ?? "unknown";
    const text = document.getText({
      start: { line, character },
      end: { line, character: character + length },
    });

    tokens.push({ line, start: character, length, type: tokenType, text });
  }

  return tokens;
}

describe("semantic tokens", () => {
  it("advertises semantic token support", () => {
    expect(core.buildServerCapabilities()).toMatchObject({
      semanticTokensProvider: {
        full: true,
      },
    });
  });

  it("builds lightweight semantic tokens for decorators and declarations", () => {
    const document = makeDocument(
      "file:///entry.ets",
      [
        "@Component",
        "export struct HomePage {",
        "  @State count: number = 0;",
        "  build() {",
        "    let total = helper(this.count);",
        "  }",
        "}",
      ].join("\n"),
    );

    const buildSemanticTokens = (
      core as typeof core & {
        buildSemanticTokens?: (document: TextDocument) => { data: number[] };
        semanticTokenLegend?: { tokenTypes: string[] };
      }
    ).buildSemanticTokens;
    const legend = (
      core as typeof core & {
        semanticTokenLegend?: { tokenTypes: string[] };
      }
    ).semanticTokenLegend;

    const tokens = decodeSemanticTokens(document, buildSemanticTokens?.(document).data ?? [], legend ?? { tokenTypes: [] });

    expect(tokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "@Component", type: "decorator" }),
        expect.objectContaining({ text: "struct", type: "keyword" }),
        expect.objectContaining({ text: "HomePage", type: "type" }),
        expect.objectContaining({ text: "@State", type: "decorator" }),
        expect.objectContaining({ text: "count", type: "property" }),
        expect.objectContaining({ text: "number", type: "type" }),
        expect.objectContaining({ text: "build", type: "function" }),
        expect.objectContaining({ text: "total", type: "variable" }),
        expect.objectContaining({ text: "helper", type: "function" }),
      ]),
    );
  });
});
