import { Hover, Position } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { resolveLinkedReferenceTarget } from "./navigation.js";
import { collectImportBindings, escapeMarkdown, getImportBindingAtPosition } from "./text.js";
import { collectDocumentSymbols, displayDocumentName, symbolKindLabel } from "./symbols.js";

export function buildHover(document: TextDocument, position: Position): Hover | null {
  const lineText = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  }).trim();
  if (!lineText) {
    return null;
  }

  return {
    contents: {
      kind: "markdown",
      value: ["### ArkTS LSP", "", "MVP hover information for the current line.", "", `Line content: \`${escapeMarkdown(lineText)}\``].join("\n"),
    },
  };
}

export function buildLinkedHover(
  documents: TextDocument[],
  document: TextDocument,
  position: Position,
  resolveImportTarget: (documentUri: string, specifier: string) => TextDocument | null,
): Hover | null {
  const importBinding = getImportBindingAtPosition(document, position);
  if (importBinding) {
    const targetDocument = resolveImportTarget(document.uri, importBinding.specifier);
    const exportedSymbol = targetDocument
      ? collectDocumentSymbols(targetDocument).find((symbol) => symbol.name === importBinding.importedName)
      : null;
    if (exportedSymbol && targetDocument) {
      return {
        contents: {
          kind: "markdown",
          value: [
            `### ${symbolKindLabel(exportedSymbol.kind)} \`${importBinding.localName}\``,
            "",
            importBinding.localName === importBinding.importedName
              ? `Imported from \`${importBinding.specifier}\``
              : `Alias of \`${importBinding.importedName}\` from \`${importBinding.specifier}\``,
            "",
            `Defined in \`${displayDocumentName(targetDocument.uri)}\``,
          ].join("\n"),
        },
      };
    }
  }

  const linkedTarget = resolveLinkedReferenceTarget(documents, document, position, resolveImportTarget);
  const exportedSymbol = linkedTarget
    ? collectDocumentSymbols(linkedTarget.exportedDocument).find((symbol) => symbol.name === linkedTarget.exportedName)
    : null;
  if (linkedTarget && exportedSymbol) {
    return {
      contents: {
        kind: "markdown",
        value: [
          `### ${symbolKindLabel(exportedSymbol.kind)} \`${linkedTarget.exportedName}\``,
          "",
          `Defined in \`${displayDocumentName(linkedTarget.exportedDocument.uri)}\``,
        ].join("\n"),
      },
    };
  }

  return buildHover(document, position);
}
