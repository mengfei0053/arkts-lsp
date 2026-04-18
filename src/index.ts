import {
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  DidChangeConfigurationNotification,
  Hover,
  InitializeParams,
  InitializeResult,
  Location,
  Position,
  ProposedFeatures,
  SymbolInformation,
  SymbolKind,
  TextDocumentSyncKind,
  WorkspaceSymbol,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments } from "vscode-languageserver";

type ServerSettings = {
  maxNumberOfProblems: number;
};

const defaultSettings: ServerSettings = { maxNumberOfProblems: 100 };
const globalSettings: ServerSettings = defaultSettings;

const connection = createConnection(ProposedFeatures.all, process.stdin, process.stdout);
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;
  hasConfigurationCapability = Boolean(capabilities.workspace?.configuration);

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      definitionProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
    },
  };
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
});

connection.onDidChangeConfiguration(() => {
  documents.all().forEach(validateTextDocument);
});

documents.onDidClose((event) => {
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

documents.onDidChangeContent((change) => {
  void validateTextDocument(change.document);
});

connection.onHover(({ textDocument, position }): Hover | null => {
  const document = documents.get(textDocument.uri);
  if (!document) {
    return null;
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
      value: [
        "### ArkTS LSP",
        "",
        "MVP hover information for the current line.",
        "",
        `Line content: \`${escapeMarkdown(lineText)}\``,
      ].join("\n"),
    },
  };
});

connection.onDocumentSymbol(({ textDocument }): SymbolInformation[] => {
  const document = documents.get(textDocument.uri);
  if (!document) {
    return [];
  }

  return collectDocumentSymbols(document);
});

connection.onWorkspaceSymbol(({ query }): WorkspaceSymbol[] => {
  const normalizedQuery = query.trim().toLowerCase();
  const symbols = documents
    .all()
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
});

connection.onDefinition(({ textDocument, position }): Location[] => {
  const document = documents.get(textDocument.uri);
  if (!document) {
    return [];
  }

  const word = getWordAtPosition(document, position);
  if (!word) {
    return [];
  }

  const symbols = documents
    .all()
    .flatMap((candidate) => collectDocumentSymbols(candidate))
    .filter((symbol) => symbol.name === word);

  const sameDocumentSymbols = symbols.filter((symbol) => symbol.location.uri === textDocument.uri);
  return [...sameDocumentSymbols, ...symbols.filter((symbol) => symbol.location.uri !== textDocument.uri)].map(
    (symbol) => symbol.location,
  );
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const settings = await getDocumentSettings(textDocument.uri);
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

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

async function getDocumentSettings(_resource: string): Promise<ServerSettings> {
  return globalSettings;
}

function escapeMarkdown(value: string): string {
  return value.replace(/[`\\]/gu, "\\$&");
}

function collectDocumentSymbols(document: TextDocument): SymbolInformation[] {
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

function getWordAtPosition(document: TextDocument, position: Position): string | null {
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

documents.listen(connection);
connection.listen();
