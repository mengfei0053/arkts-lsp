import {
  CompletionItem,
  CompletionItemKind,
  Diagnostic,
  DiagnosticSeverity,
  DocumentHighlight,
  DocumentHighlightKind,
  Hover,
  Location,
  Position,
  SymbolInformation,
  SymbolKind,
  TextEdit,
  WorkspaceEdit,
  WorkspaceSymbol,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";

export type ServerSettings = {
  maxNumberOfProblems: number;
};

type DefinitionContext = {
  document: TextDocument;
  symbols: SymbolInformation[];
};

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
      value: [
        "### ArkTS LSP",
        "",
        "MVP hover information for the current line.",
        "",
        `Line content: \`${escapeMarkdown(lineText)}\``,
      ].join("\n"),
    },
  };
}

export function collectDiagnostics(textDocument: TextDocument, settings: ServerSettings): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const text = textDocument.getText();
  const lines = text.split(/\r?\n/u);

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

export function collectDocumentSymbols(document: TextDocument): SymbolInformation[] {
  const text = document.getText();
  const lines = text.split(/\r?\n/u);
  const symbols: SymbolInformation[] = [];
  let pendingDecorator: string | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();

    if (!trimmed) {
      pendingDecorator = null;
      continue;
    }

    if (trimmed.startsWith("@")) {
      pendingDecorator = trimmed.slice(1);
      continue;
    }

    const structMatch = trimmed.match(/^struct\s+([A-Za-z_]\w*)/u);
    if (structMatch) {
      symbols.push(createSymbol(document, lineIndex, line, structMatch[1], SymbolKind.Class, pendingDecorator ?? "struct"));
      pendingDecorator = null;
      continue;
    }

    const patterns: Array<{ regex: RegExp; kind: SymbolKind; containerName?: string }> = [
      { regex: /^class\s+([A-Za-z_]\w*)/u, kind: SymbolKind.Class },
      { regex: /^interface\s+([A-Za-z_]\w*)/u, kind: SymbolKind.Interface },
      { regex: /^enum\s+([A-Za-z_]\w*)/u, kind: SymbolKind.Enum },
      { regex: /^type\s+([A-Za-z_]\w*)/u, kind: SymbolKind.TypeParameter },
      { regex: /^function\s+([A-Za-z_]\w*)/u, kind: SymbolKind.Function },
      { regex: /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)/u, kind: SymbolKind.Function },
      { regex: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_]\w*)/u, kind: SymbolKind.Variable },
      { regex: /^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_]\w*)/u, kind: SymbolKind.Class },
      { regex: /^(?:export\s+)?interface\s+([A-Za-z_]\w*)/u, kind: SymbolKind.Interface },
      { regex: /^(?:export\s+)?enum\s+([A-Za-z_]\w*)/u, kind: SymbolKind.Enum },
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern.regex);
      if (match) {
        symbols.push(createSymbol(document, lineIndex, line, match[1], pattern.kind, pendingDecorator ?? pattern.containerName));
        pendingDecorator = null;
        break;
      }
    }
  }

  return symbols;
}

export function collectWorkspaceSymbols(documents: TextDocument[], query: string): WorkspaceSymbol[] {
  const normalizedQuery = query.trim().toLowerCase();
  const symbols = documents
    .flatMap((document) => collectDocumentSymbols(document))
    .filter((symbol) => {
      if (!normalizedQuery) {
        return true;
      }

      const haystack = `${symbol.name} ${symbol.containerName ?? ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });

  return symbols.slice(0, 100).map((symbol) => ({
    name: symbol.name,
    kind: symbol.kind,
    location: symbol.location,
    containerName: symbol.containerName,
  }));
}

export function findDefinitions({ document, symbols }: DefinitionContext, position: Position): Location[] {
  const word = getWordAtPosition(document, position);
  if (!word) {
    return [];
  }

  const matches = symbols.filter((symbol) => symbol.name === word);
  const sameDocumentMatches = matches.filter((symbol) => symbol.location.uri === document.uri);

  return [...sameDocumentMatches, ...matches.filter((symbol) => symbol.location.uri !== document.uri)].map(
    (symbol) => symbol.location,
  );
}

export function findReferences(documents: TextDocument[], document: TextDocument, position: Position): Location[] {
  const word = getWordAtPosition(document, position);
  if (!word) {
    return [];
  }

  return documents.flatMap((candidate) => collectWordLocations(candidate, word));
}

export function findDocumentHighlights(document: TextDocument, position: Position): DocumentHighlight[] {
  const word = getWordAtPosition(document, position);
  if (!word) {
    return [];
  }

  return collectWordLocations(document, word).map((location) => ({
    range: location.range,
    kind: DocumentHighlightKind.Text,
  }));
}

export function buildRenameEdit(
  documents: TextDocument[],
  document: TextDocument,
  position: Position,
  newName: string,
): WorkspaceEdit | null {
  const oldName = getWordAtPosition(document, position);
  if (!oldName || !newName.trim() || oldName === newName) {
    return null;
  }

  const changes: Record<string, TextEdit[]> = {};

  for (const candidate of documents) {
    const locations = collectWordLocations(candidate, oldName);
    if (locations.length === 0) {
      continue;
    }

    changes[candidate.uri] = locations.map((location) => ({
      range: location.range,
      newText: newName,
    }));
  }

  return Object.keys(changes).length > 0 ? { changes } : null;
}

export function buildCompletionItems(documents: TextDocument[], document: TextDocument, position: Position): CompletionItem[] {
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
    if (seen.has(symbol.name)) {
      continue;
    }
    if (prefix && !symbol.name.toLowerCase().startsWith(prefix)) {
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

export function getWordAtPosition(document: TextDocument, position: Position): string | null {
  const lineRange = {
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  };
  const line = document.getText(lineRange);
  const safeCharacter = Math.min(position.character, line.length);
  const isWord = (value: string): boolean => /[A-Za-z0-9_]/u.test(value);

  let start = safeCharacter;
  while (start > 0 && isWord(line[start - 1] ?? "")) {
    start -= 1;
  }

  let end = safeCharacter;
  while (end < line.length && isWord(line[end] ?? "")) {
    end += 1;
  }

  if (start === end) {
    return null;
  }

  return line.slice(start, end);
}

function collectWordLocations(document: TextDocument, word: string): Location[] {
  const escapedWord = escapeRegExp(word);
  const pattern = new RegExp(`\\b${escapedWord}\\b`, "gu");
  const lines = document.getText().split(/\r?\n/u);
  const locations: Location[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const match of line.matchAll(pattern)) {
      const startCharacter = match.index ?? 0;
      locations.push({
        uri: document.uri,
        range: {
          start: { line: lineIndex, character: startCharacter },
          end: { line: lineIndex, character: startCharacter + word.length },
        },
      });
    }
  }

  return locations;
}

function getCompletionPrefix(document: TextDocument, position: Position): string {
  const lineRange = {
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  };
  const line = document.getText(lineRange);
  const safeCharacter = Math.min(position.character, line.length);
  let start = safeCharacter;

  while (start > 0 && /[@A-Za-z0-9_]/u.test(line[start - 1] ?? "")) {
    start -= 1;
  }

  return line.slice(start, safeCharacter);
}

function createSymbol(
  document: TextDocument,
  lineIndex: number,
  line: string,
  name: string,
  kind: SymbolKind,
  containerName?: string,
): SymbolInformation {
  const startCharacter = Math.max(line.indexOf(name), 0);

  return {
    name,
    kind,
    location: {
      uri: document.uri,
      range: {
        start: { line: lineIndex, character: startCharacter },
        end: { line: lineIndex, character: startCharacter + name.length },
      },
    },
    containerName,
  };
}

function mapSymbolKindToCompletionKind(symbolKind: SymbolKind): CompletionItemKind {
  switch (symbolKind) {
    case SymbolKind.Class:
      return CompletionItemKind.Class;
    case SymbolKind.Interface:
      return CompletionItemKind.Interface;
    case SymbolKind.Enum:
      return CompletionItemKind.Enum;
    case SymbolKind.Function:
      return CompletionItemKind.Function;
    case SymbolKind.Variable:
      return CompletionItemKind.Variable;
    case SymbolKind.TypeParameter:
      return CompletionItemKind.TypeParameter;
    default:
      return CompletionItemKind.Text;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function escapeMarkdown(value: string): string {
  return value.replace(/[`\\]/gu, "\\$&");
}
