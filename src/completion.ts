import { CompletionItem, CompletionItemKind } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { collectDocumentSymbols, collectExportedSymbolLocations, displayDocumentName, mapSymbolKindToCompletionKind } from "./symbols.js";
import { collectImportBindings, escapeRegExp, getMemberAccessContextAtPosition, getNamedImportContextAtPosition } from "./text.js";

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

export function buildClassMemberCompletionItems(targetDocument: TextDocument, className: string, prefix = ""): CompletionItem[] {
  return collectClassMembers(targetDocument, className)
    .filter((member) => !prefix || member.name.toLowerCase().startsWith(prefix.toLowerCase()))
    .slice(0, 100)
    .map((member) => ({
      label: member.name,
      kind: member.kind,
      detail: `Member of ${className}`,
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

function collectClassMembers(document: TextDocument, className: string): Array<{ name: string; kind: CompletionItemKind }> {
  const lines = document.getText().split(/\r?\n/u);
  const classIndex = lines.findIndex((line) =>
    new RegExp(`^\\s*(?:export\\s+)?(?:abstract\\s+)?class\\s+${escapeRegExp(className)}\\b`, "u").test(line.trim()),
  );
  if (classIndex < 0) {
    return [];
  }

  const members: Array<{ name: string; kind: CompletionItemKind }> = [];
  let braceDepth = 0;
  let inClassBody = false;

  for (let lineIndex = classIndex; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const char of line) {
      if (char === "{") {
        braceDepth += 1;
        inClassBody = true;
      } else if (char === "}") {
        braceDepth -= 1;
        if (inClassBody && braceDepth <= 0) {
          return dedupeMembers(members);
        }
      }
    }

    if (!inClassBody) {
      continue;
    }

    const methodMatch = line.match(/^\s*(?:public\s+|private\s+|protected\s+)?static\s+([A-Za-z_]\w*)\s*\(/u);
    if (methodMatch) {
      members.push({ name: methodMatch[1], kind: CompletionItemKind.Method });
      continue;
    }

    const propertyMatch = line.match(
      /^\s*(?:public\s+|private\s+|protected\s+)?static\s+(?:readonly\s+)?([A-Za-z_]\w*)\s*(?::|=)/u,
    );
    if (propertyMatch) {
      members.push({ name: propertyMatch[1], kind: CompletionItemKind.Field });
    }
  }

  return dedupeMembers(members);
}

function dedupeMembers(members: Array<{ name: string; kind: CompletionItemKind }>): Array<{ name: string; kind: CompletionItemKind }> {
  const seen = new Set<string>();
  return members.filter((member) => {
    if (seen.has(member.name)) {
      return false;
    }
    seen.add(member.name);
    return true;
  });
}
