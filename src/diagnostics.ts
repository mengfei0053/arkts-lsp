import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ServerSettings } from "./types.js";

export function collectDiagnostics(textDocument: TextDocument, settings: ServerSettings): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = textDocument.getText().split(/\r?\n/u);

  for (let index = 0; index < lines.length && diagnostics.length < settings.maxNumberOfProblems; index += 1) {
    const line = lines[index];

    const todoIndex = line.indexOf("TODO");
    if (todoIndex >= 0) {
      diagnostics.push({
        severity: DiagnosticSeverity.Information,
        range: {
          start: { line: index, character: todoIndex },
          end: { line: index, character: todoIndex + 4 },
        },
        message: "TODO marker found. Consider tracking or resolving it before release.",
        source: "arkts-lsp",
      });
    }

    const anyIndex = line.indexOf(": any");
    if (anyIndex >= 0 && diagnostics.length < settings.maxNumberOfProblems) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: { line: index, character: anyIndex + 2 },
          end: { line: index, character: anyIndex + 5 },
        },
        message: "Avoid `any` where possible. Prefer a concrete ArkTS-friendly type.",
        source: "arkts-lsp",
      });
    }
  }

  return diagnostics;
}
