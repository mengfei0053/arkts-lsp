import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as core from "../src/core.js";

function makeDocument(uri: string, languageId: string, text: string): TextDocument {
  return TextDocument.create(uri, languageId, 1, text);
}

describe("buildCodeActions", () => {
  it("advertises code action support", () => {
    expect(core.buildServerCapabilities()).toMatchObject({
      codeActionProvider: true,
    });
  });

  it("builds quick fixes for TODO markers and any usage", () => {
    const document = makeDocument(
      "file:///entry.ets",
      "arkts",
      ["// TODO: revisit this before release", "const value: any = loadValue();"].join("\n"),
    );
    const diagnostics = core.collectDiagnostics(document, { maxNumberOfProblems: 10 });

    const buildCodeActions = (
      core as typeof core & {
        buildCodeActions?: (
          document: TextDocument,
          diagnostics: Array<{ message: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }>,
        ) => Array<{ title: string; kind?: string; edit?: { changes?: Record<string, Array<{ newText: string }>> } }>;
      }
    ).buildCodeActions;

    const actions = buildCodeActions?.(document, diagnostics) ?? [];

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({
      title: "Remove TODO comment",
      kind: "quickfix",
      edit: {
        changes: {
          "file:///entry.ets": [
            {
              newText: "",
            },
          ],
        },
      },
    });
    expect(actions[1]).toMatchObject({
      title: "Replace `any` with `unknown`",
      kind: "quickfix",
      edit: {
        changes: {
          "file:///entry.ets": [
            {
              newText: "unknown",
            },
          ],
        },
      },
    });
  });

  it("ignores non-ArkTS and non-TypeScript documents", () => {
    const document = makeDocument("file:///notes.md", "markdown", "<!-- TODO: keep -->");

    const buildCodeActions = (
      core as typeof core & {
        buildCodeActions?: (
          document: TextDocument,
          diagnostics: Array<{ message: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }>,
        ) => Array<unknown>;
      }
    ).buildCodeActions;

    expect(buildCodeActions?.(document, core.collectDiagnostics(document, { maxNumberOfProblems: 10 })) ?? []).toEqual([]);
  });
});
