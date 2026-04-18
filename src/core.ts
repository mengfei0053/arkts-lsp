import {
  Diagnostic,
  DiagnosticSeverity,
  Hover,
  Location,
  Position,
  SymbolInformation,
  SymbolKind,
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

function escapeMarkdown(value: string): string {
  return value.replace(/[`\\]/gu, "\\$&");
}
