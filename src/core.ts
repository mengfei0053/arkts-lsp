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

type LinkedReferenceTarget = {
  exportedName: string;
  exportedDocument: TextDocument;
};

export type ImportBinding = {
  importedName: string;
  localName: string;
  specifier: string;
  range: {
    start: Position;
    end: Position;
  };
};

export type ImportContext = {
  specifier: string;
  range: {
    start: Position;
    end: Position;
  };
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

export function collectImportBindings(document: TextDocument): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  const lines = document.getText().split(/\r?\n/u);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const match = line.match(/^\s*import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/u);
    if (!match || match.index === undefined) {
      continue;
    }

    const specifier = match[2];
    const clause = match[1];
    const clauseOffset = line.indexOf(clause);
    if (clauseOffset < 0) {
      continue;
    }

    for (const entry of clause.split(",")) {
      const rawPart = entry.trim();
      if (!rawPart) {
        continue;
      }

      const aliasMatch = rawPart.match(/^([A-Za-z_]\w*)\s+as\s+([A-Za-z_]\w*)$/u);
      const importedName = aliasMatch ? aliasMatch[1] : rawPart;
      const localName = aliasMatch ? aliasMatch[2] : rawPart;
      const localNameOffset = line.indexOf(localName, clauseOffset);
      if (localNameOffset < 0) {
        continue;
      }

      bindings.push({
        importedName,
        localName,
        specifier,
        range: {
          start: { line: lineIndex, character: localNameOffset },
          end: { line: lineIndex, character: localNameOffset + localName.length },
        },
      });
    }
  }

  return bindings;
}

export function getImportBindingAtPosition(document: TextDocument, position: Position): ImportBinding | null {
  const word = getWordAtPosition(document, position);
  if (!word) {
    return null;
  }

  const sameLineBinding = collectImportBindings(document).find((binding) => {
    return (
      binding.localName === word &&
      binding.range.start.line === position.line &&
      position.character >= binding.range.start.character &&
      position.character <= binding.range.end.character
    );
  });

  if (sameLineBinding) {
    return sameLineBinding;
  }

  return collectImportBindings(document).find((binding) => binding.localName === word) ?? null;
}

export function collectExportedSymbolLocations(document: TextDocument): Map<string, Location[]> {
  const lines = document.getText().split(/\r?\n/u);
  const exportedNames = new Set<string>();
  const patterns = [
    /^(?:\s*)export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)/u,
    /^(?:\s*)export\s+(?:abstract\s+)?class\s+([A-Za-z_]\w*)/u,
    /^(?:\s*)export\s+interface\s+([A-Za-z_]\w*)/u,
    /^(?:\s*)export\s+enum\s+([A-Za-z_]\w*)/u,
    /^(?:\s*)export\s+type\s+([A-Za-z_]\w*)/u,
    /^(?:\s*)export\s+(?:const|let|var)\s+([A-Za-z_]\w*)/u,
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        exportedNames.add(match[1]);
      }
    }
  }

  const result = new Map<string, Location[]>();
  for (const symbol of collectDocumentSymbols(document)) {
    if (!exportedNames.has(symbol.name)) {
      continue;
    }

    const current = result.get(symbol.name) ?? [];
    current.push(symbol.location);
    result.set(symbol.name, current);
  }

  return result;
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
  return findReferencesWithOptions(documents, document, position, true);
}

export function findReferencesWithOptions(
  documents: TextDocument[],
  document: TextDocument,
  position: Position,
  includeDeclaration: boolean,
): Location[] {
  const word = getWordAtPosition(document, position);
  if (!word) {
    return [];
  }

  const references = documents.flatMap((candidate) => collectWordLocations(candidate, word));
  if (includeDeclaration) {
    return references;
  }

  const declarationKeys = new Set(
    documents
      .flatMap((candidate) => collectDocumentSymbols(candidate))
      .filter((symbol) => symbol.name === word)
      .map((symbol) => locationKey(symbol.location)),
  );

  return references.filter((location) => !declarationKeys.has(locationKey(location)));
}

export function findLinkedReferences(
  documents: TextDocument[],
  document: TextDocument,
  position: Position,
  includeDeclaration: boolean,
  resolveImportTarget: (documentUri: string, specifier: string) => TextDocument | null,
): Location[] {
  const target = resolveLinkedReferenceTarget(documents, document, position, resolveImportTarget);
  if (!target) {
    return [];
  }

  const references = [
    ...collectWordLocations(target.exportedDocument, target.exportedName),
    ...documents.flatMap((candidate) => collectLinkedImportReferences(candidate, target, resolveImportTarget)),
  ];

  const uniqueReferences = dedupeLocations(references);
  if (includeDeclaration) {
    return uniqueReferences;
  }

  const declarationKeys = new Set(
    (collectExportedSymbolLocations(target.exportedDocument).get(target.exportedName) ?? []).map((location) => locationKey(location)),
  );

  return uniqueReferences.filter((location) => !declarationKeys.has(locationKey(location)));
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

export function buildImportCompletionItems(specifiers: string[]): CompletionItem[] {
  return specifiers.map((specifier) => ({
    label: specifier,
    kind: CompletionItemKind.File,
    detail: "ArkTS module path",
    insertText: specifier,
  }));
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

export function getImportContextAtPosition(document: TextDocument, position: Position): ImportContext | null {
  const lines = document.getText().split(/\r?\n/u);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const importMatch = line.match(/^\s*import\s+.*?from\s+["']([^"']*)["']/u) ?? line.match(/^\s*import\s+["']([^"']*)["']/u);
    if (!importMatch || importMatch.index === undefined) {
      continue;
    }

    const specifier = importMatch[1];
    const quotedSpecifier = importMatch[0];
    const relativeStart = quotedSpecifier.lastIndexOf(specifier);
    if (relativeStart < 0) {
      continue;
    }

    const absoluteStart = importMatch.index + relativeStart;
    const absoluteEnd = absoluteStart + specifier.length;
    if (position.line !== lineIndex) {
      continue;
    }
    if (position.character < absoluteStart || position.character > absoluteEnd) {
      continue;
    }

    return {
      specifier,
      range: {
        start: { line: lineIndex, character: absoluteStart },
        end: { line: lineIndex, character: absoluteEnd },
      },
    };
  }

  return null;
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
      if (isInsideQuotedString(line, startCharacter)) {
        continue;
      }
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

function collectLinkedImportReferences(
  document: TextDocument,
  target: LinkedReferenceTarget,
  resolveImportTarget: (documentUri: string, specifier: string) => TextDocument | null,
): Location[] {
  const bindings = collectImportBindings(document).filter((binding) => {
    const resolvedTarget = resolveImportTarget(document.uri, binding.specifier);
    return resolvedTarget?.uri === target.exportedDocument.uri && binding.importedName === target.exportedName;
  });

  return bindings.flatMap((binding) => collectWordLocations(document, binding.localName));
}

function resolveLinkedReferenceTarget(
  documents: TextDocument[],
  document: TextDocument,
  position: Position,
  resolveImportTarget: (documentUri: string, specifier: string) => TextDocument | null,
): LinkedReferenceTarget | null {
  const bindingAtPosition = getImportBindingAtPosition(document, position);
  if (bindingAtPosition) {
    const targetDocument = resolveImportTarget(document.uri, bindingAtPosition.specifier);
    if (targetDocument) {
      return {
        exportedName: bindingAtPosition.importedName,
        exportedDocument: targetDocument,
      };
    }
  }

  const word = getWordAtPosition(document, position);
  if (!word) {
    return null;
  }

  const importedBinding = collectImportBindings(document).find((binding) => binding.localName === word);
  if (importedBinding) {
    const targetDocument = resolveImportTarget(document.uri, importedBinding.specifier);
    if (targetDocument) {
      return {
        exportedName: importedBinding.importedName,
        exportedDocument: targetDocument,
      };
    }
  }

  const exportedLocations = collectExportedSymbolLocations(document).get(word) ?? [];
  if (exportedLocations.some((location) => isPositionWithinRange(position, location.range))) {
    return {
      exportedName: word,
      exportedDocument: document,
    };
  }

  const importedDocuments = documents.filter((candidate) =>
    collectImportBindings(candidate).some((binding) => {
      const targetDocument = resolveImportTarget(candidate.uri, binding.specifier);
      return targetDocument?.uri === document.uri && binding.importedName === word;
    }),
  );

  if (importedDocuments.length > 0 && exportedLocations.length > 0) {
    return {
      exportedName: word,
      exportedDocument: document,
    };
  }

  return null;
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

function isInsideQuotedString(line: string, index: number): boolean {
  const before = line.slice(0, index);
  return (
    countUnescaped(before, "'") % 2 === 1 ||
    countUnescaped(before, '"') % 2 === 1 ||
    countUnescaped(before, "`") % 2 === 1
  );
}

function countUnescaped(text: string, quote: string): number {
  let count = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === quote && text[index - 1] !== "\\") {
      count += 1;
    }
  }

  return count;
}

function locationKey(location: Location): string {
  return `${location.uri}:${location.range.start.line}:${location.range.start.character}:${location.range.end.line}:${location.range.end.character}`;
}

function dedupeLocations(locations: Location[]): Location[] {
  const seen = new Set<string>();

  return locations.filter((location) => {
    const key = locationKey(location);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isPositionWithinRange(position: Position, range: { start: Position; end: Position }): boolean {
  if (position.line < range.start.line || position.line > range.end.line) {
    return false;
  }
  if (position.line === range.start.line && position.character < range.start.character) {
    return false;
  }
  if (position.line === range.end.line && position.character > range.end.character) {
    return false;
  }

  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function escapeMarkdown(value: string): string {
  return value.replace(/[`\\]/gu, "\\$&");
}
