import {
  CodeAction,
  CodeActionKind,
  Diagnostic,
  Range,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";

export function buildCodeActions(document: TextDocument, diagnostics: Diagnostic[]): CodeAction[] {
  if (!isSourceDocument(document)) {
    return [];
  }

  return diagnostics.flatMap((diagnostic) => {
    if (diagnostic.source !== "arkts-lsp") {
      return [];
    }

    if (diagnostic.message.includes("TODO marker found")) {
      return [
        {
          title: "Remove TODO comment",
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [document.uri]: [
                {
                  range: buildTodoRemovalRange(document, diagnostic.range.start.line),
                  newText: "",
                },
              ],
            },
          },
        },
      ];
    }

    if (diagnostic.message.includes("Avoid `any`")) {
      return [
        {
          title: "Replace `any` with `unknown`",
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [document.uri]: [
                {
                  range: diagnostic.range,
                  newText: "unknown",
                },
              ],
            },
          },
        },
      ];
    }

    return [];
  });
}

function isSourceDocument(document: TextDocument): boolean {
  return ["arkts", "typescript"].includes(document.languageId) || /\.(ets|ts)$/u.test(document.uri);
}

function buildTodoRemovalRange(document: TextDocument, line: number): Range {
  const lines = document.getText().split(/\r?\n/u);
  const currentLine = lines[line] ?? "";
  const hasNextLine = line + 1 < lines.length;

  return {
    start: { line, character: 0 },
    end: hasNextLine
      ? { line: line + 1, character: 0 }
      : { line, character: currentLine.length },
  };
}
