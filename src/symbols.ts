import {
  CompletionItemKind,
  Location,
  SymbolInformation,
  SymbolKind,
  WorkspaceSymbol,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";

export function collectDocumentSymbols(document: TextDocument): SymbolInformation[] {
  const lines = document.getText().split(/\r?\n/u);
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

    for (const pattern of declarationPatterns) {
      const match = trimmed.match(pattern.regex);
      if (!match) {
        continue;
      }
      symbols.push(createSymbol(document, lineIndex, line, match[1], pattern.kind, pendingDecorator ?? pattern.containerName));
      pendingDecorator = null;
      break;
    }
  }

  return symbols;
}

export function collectWorkspaceSymbols(documents: TextDocument[], query: string): WorkspaceSymbol[] {
  const normalizedQuery = query.trim().toLowerCase();
  return documents
    .flatMap((document) => collectDocumentSymbols(document))
    .filter((symbol) => {
      if (!normalizedQuery) {
        return true;
      }
      return `${symbol.name} ${symbol.containerName ?? ""}`.toLowerCase().includes(normalizedQuery);
    })
    .slice(0, 100)
    .map((symbol) => ({
      name: symbol.name,
      kind: symbol.kind,
      location: symbol.location,
      containerName: symbol.containerName,
    }));
}

export function collectExportedSymbolLocations(document: TextDocument): Map<string, Location[]> {
  const exportedNames = new Set<string>();
  for (const line of document.getText().split(/\r?\n/u)) {
    for (const pattern of exportPatterns) {
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
    result.set(symbol.name, [...(result.get(symbol.name) ?? []), symbol.location]);
  }

  return result;
}

export function mapSymbolKindToCompletionKind(symbolKind: SymbolKind): CompletionItemKind {
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

export function symbolKindLabel(symbolKind: SymbolKind): string {
  switch (symbolKind) {
    case SymbolKind.Class:
      return "Class";
    case SymbolKind.Interface:
      return "Interface";
    case SymbolKind.Enum:
      return "Enum";
    case SymbolKind.Function:
      return "Function";
    case SymbolKind.Variable:
      return "Variable";
    case SymbolKind.TypeParameter:
      return "Type";
    default:
      return "Symbol";
  }
}

export function displayDocumentName(uri: string): string {
  return decodeURIComponent(uri.split("/").at(-1) ?? uri);
}

const declarationPatterns: Array<{ regex: RegExp; kind: SymbolKind; containerName?: string }> = [
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

const exportPatterns = [
  /^(?:\s*)export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)/u,
  /^(?:\s*)export\s+(?:abstract\s+)?class\s+([A-Za-z_]\w*)/u,
  /^(?:\s*)export\s+interface\s+([A-Za-z_]\w*)/u,
  /^(?:\s*)export\s+enum\s+([A-Za-z_]\w*)/u,
  /^(?:\s*)export\s+type\s+([A-Za-z_]\w*)/u,
  /^(?:\s*)export\s+(?:const|let|var)\s+([A-Za-z_]\w*)/u,
];

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
