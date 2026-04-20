import { CompletionItem, CompletionItemKind } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  collectDocumentSymbols,
  collectExportedSymbolLocations,
  collectTypeMemberSymbols,
  displayDocumentName,
  mapSymbolKindToCompletionKind,
  mapTypeMemberKindToCompletionKind,
} from "./symbols.js";
import { collectImportBindings, getMemberAccessContextAtPosition, getNamedImportContextAtPosition } from "./text.js";

type MemberCompletionMode = "static" | "instance";

const arktsKeywords = [
  "import",
  "export",
  "struct",
  "class",
  "interface",
  "enum",
  "type",
  "extends",
  "implements",
  "function",
  "const",
  "let",
  "var",
  "if",
  "else",
  "for",
  "while",
  "return",
  "async",
  "await",
  "@Entry",
  "@Component",
  "@State",
  "@Prop",
  "@Link",
];

export function buildCompletionItems(documents: TextDocument[], document: TextDocument, position: { line: number; character: number }): CompletionItem[] {
  const prefix = getCompletionPrefix(document, position).toLowerCase();
  const seen = new Set<string>();
  const items: CompletionItem[] = [];

  for (const keyword of arktsKeywords) {
    if (!prefix || keyword.toLowerCase().startsWith(prefix)) {
      items.push({
        label: keyword,
        kind: keyword.startsWith("@") ? CompletionItemKind.Property : CompletionItemKind.Keyword,
        detail: "ArkTS keyword",
      });
      seen.add(keyword);
    }
  }

  for (const symbol of documents.flatMap((candidate) => collectDocumentSymbols(candidate))) {
    if (seen.has(symbol.name) || (prefix && !symbol.name.toLowerCase().startsWith(prefix))) {
      continue;
    }
    items.push({
      label: symbol.name,
      kind: mapSymbolKindToCompletionKind(symbol.kind),
      detail: symbol.containerName ? `Workspace symbol (${symbol.containerName})` : "Workspace symbol",
    });
    seen.add(symbol.name);
  }

  return items.slice(0, 100);
}

export function buildImportCompletionItems(specifiers: string[]): CompletionItem[] {
  return specifiers.map((specifier) => ({
    label: specifier,
    kind: CompletionItemKind.File,
    detail: "ArkTS module path",
    insertText: specifier,
  }));
}

export function buildNamedImportCompletionItems(
  document: TextDocument,
  position: { line: number; character: number },
  targetDocument: TextDocument,
): CompletionItem[] {
  const context = getNamedImportContextAtPosition(document, position);
  if (!context) {
    return [];
  }

  const existingBindings = new Set(collectImportBindings(document).map((binding) => binding.importedName));
  return collectDocumentSymbols(targetDocument)
    .filter((symbol) => (collectExportedSymbolLocations(targetDocument).get(symbol.name) ?? []).length > 0)
    .filter((symbol) => !existingBindings.has(symbol.name) || symbol.name.startsWith(context.importedPrefix))
    .filter((symbol) => !context.importedPrefix || symbol.name.toLowerCase().startsWith(context.importedPrefix.toLowerCase()))
    .slice(0, 100)
    .map((symbol) => ({
      label: symbol.name,
      kind: mapSymbolKindToCompletionKind(symbol.kind),
      detail: `Export from ${displayDocumentName(targetDocument.uri)}`,
      insertText: symbol.name,
    }));
}

export function buildClassMemberCompletionItems(
  targetDocument: TextDocument,
  className: string,
  prefix = "",
  mode: MemberCompletionMode = "static",
): CompletionItem[] {
  return collectClassMembers(targetDocument, className, mode)
    .filter((member) => !prefix || member.name.toLowerCase().startsWith(prefix.toLowerCase()))
    .slice(0, 100)
    .map((member) => ({
      label: member.name,
      kind: member.kind,
      detail: member.detail,
      insertText: member.name,
    }));
}

export { getMemberAccessContextAtPosition };

function getCompletionPrefix(document: TextDocument, position: { line: number; character: number }): string {
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  });
  const safeCharacter = Math.min(position.character, line.length);
  let start = safeCharacter;
  while (start > 0 && /[@A-Za-z0-9_]/u.test(line[start - 1] ?? "")) {
    start -= 1;
  }
  return line.slice(start, safeCharacter);
}

function collectClassMembers(
  document: TextDocument,
  className: string,
  mode: MemberCompletionMode,
): Array<{ name: string; kind: CompletionItemKind; detail: string }> {
  return collectTypeMemberSymbols(document, className)
    .filter((member) => {
      const isStatic = /\bstatic\b/u.test(member.declarationText);
      return isStatic === (mode === "static");
    })
    .map((member) => ({
      name: member.name,
      kind: mapTypeMemberKindToCompletionKind(member.kind),
      detail: member.decorator ? `@${member.decorator} field of ${className}` : `Member of ${className}`,
    }));
}
