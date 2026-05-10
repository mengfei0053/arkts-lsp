import { TextDocument } from "vscode-languageserver-textdocument";
import { parseArkTS } from "./parser.js";
import { collectDocumentSymbols } from "./symbols.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type WorkspaceIndexEntry = {
  uri: string;
  symbols: ReturnType<typeof collectDocumentSymbols>;
};

// ─── Index Storage ──────────────────────────────────────────────────────────

const workspaceIndex = new Map<string, WorkspaceIndexEntry>();

/**
 * Get the workspace index entry for a URI.
 */
export function getWorkspaceIndexEntry(uri: string): WorkspaceIndexEntry | undefined {
  return workspaceIndex.get(uri);
}

/**
 * Get all workspace index entries.
 */
export function getAllWorkspaceIndexEntries(): WorkspaceIndexEntry[] {
  return Array.from(workspaceIndex.values());
}

/**
 * Index a single document: parse it and store its symbols.
 */
export function indexDocument(document: TextDocument): void {
  const tree = parseArkTS(document);
  if (!tree) {
    return;
  }

  const symbols = collectDocumentSymbols(document);
  workspaceIndex.set(document.uri, {
    uri: document.uri,
    symbols,
  });
}

/**
 * Index all currently open documents in the workspace.
 * Should be called on LSP initialization (onInitialized).
 * Returns the number of documents indexed.
 */
export function indexWorkspace(documents: TextDocument[]): number {
  let count = 0;
  for (const doc of documents) {
    indexDocument(doc);
    count++;
  }
  return count;
}

/**
 * Remove a document from the workspace index.
 */
export function removeDocumentFromIndex(uri: string): void {
  workspaceIndex.delete(uri);
}

/**
 * Clear the entire workspace index.
 */
export function clearWorkspaceIndex(): void {
  workspaceIndex.clear();
}

/**
 * Find a symbol by name across the entire workspace.
 * Returns all matching entries with their source URIs.
 */
export function findSymbolInWorkspace(name: string): Array<{ uri: string; symbol: ReturnType<typeof collectDocumentSymbols>[number] }> {
  const results: Array<{ uri: string; symbol: ReturnType<typeof collectDocumentSymbols>[number] }> = [];
  const entries = Array.from(workspaceIndex.values());
  for (const entry of entries) {
    for (const symbol of entry.symbols) {
      if (symbol.name === name) {
        results.push({ uri: entry.uri, symbol });
      }
    }
  }
  return results;
}
