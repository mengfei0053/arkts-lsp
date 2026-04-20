import { Hover, Position } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { resolveLinkedReferenceTarget } from "./navigation.js";
import { escapeMarkdown, getImportBindingAtPosition, getWordAtPosition } from "./text.js";
import { collectDocumentSymbols, displayDocumentName, findDocumentMemberSymbolAtPosition, symbolKindLabel, typeMemberLabel } from "./symbols.js";

export function buildHover(document: TextDocument, position: Position): Hover | null {
  const member = findDocumentMemberSymbolAtPosition(document, position);
  if (member) {
    return {
      contents: {
        kind: "markdown",
        value: [
          `### ${typeMemberLabel(member)} \`${member.name}\``,
          "",
          `Member of \`${member.containerName}\``,
          "",
          `Defined in \`${displayDocumentName(document.uri)}\``,
          "",
          `Declaration: \`${escapeMarkdown(member.declarationText)}\``,
        ].join("\n"),
      },
    };
  }

  const symbol = collectDocumentSymbols(document).find((candidate) => candidate.name === getWordAtPosition(document, position));
  if (symbol) {
    const lineText = readLine(document, symbol.location.range.start.line).trim();
    return {
      contents: {
        kind: "markdown",
        value: [
          `### ${symbolKindLabel(symbol.kind)} \`${symbol.name}\``,
          "",
          `Defined in \`${displayDocumentName(document.uri)}\``,
          "",
          `Declaration: \`${escapeMarkdown(lineText)}\``,
        ].join("\n"),
      },
    };
  }

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
      const declarationText = readLine(targetDocument, exportedSymbol.location.range.start.line).trim();
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
            "",
            `Declaration: \`${escapeMarkdown(declarationText)}\``,
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
    const declarationText = readLine(linkedTarget.exportedDocument, exportedSymbol.location.range.start.line).trim();
    return {
      contents: {
        kind: "markdown",
        value: [
          `### ${symbolKindLabel(exportedSymbol.kind)} \`${linkedTarget.exportedName}\``,
          "",
          `Defined in \`${displayDocumentName(linkedTarget.exportedDocument.uri)}\``,
          "",
          `Declaration: \`${escapeMarkdown(declarationText)}\``,
        ].join("\n"),
      },
    };
  }

  return buildHover(document, position);
}

function readLine(document: TextDocument, line: number): string {
  return document.getText({
    start: { line, character: 0 },
    end: { line: line + 1, character: 0 },
  });
}
