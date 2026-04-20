import {
  DocumentHighlight,
  DocumentHighlightKind,
  DocumentLink,
  Location,
  Position,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { collectDocumentSymbols, collectExportedSymbolLocations, findDocumentMemberSymbolAtPosition } from "./symbols.js";
import {
  collectImportContexts,
  collectImportBindings,
  collectWordLocations,
  getImportBindingAtPosition,
  getWordAtPosition,
  isPositionWithinRange,
  locationKey,
} from "./text.js";
import { DefinitionContext, ImportBinding, LinkedReferenceTarget } from "./types.js";

export function findDefinitions({ document, symbols }: DefinitionContext, position: Position): Location[] {
  const member = findDocumentMemberSymbolAtPosition(document, position);
  if (member) {
    return [member.location];
  }

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
  const member = findDocumentMemberSymbolAtPosition(document, position);
  if (member) {
    const references = collectScopedWordLocations(document, member.name, member.scopeRange);
    return includeDeclaration ? references : references.filter((location) => locationKey(location) !== locationKey(member.location));
  }

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

  const references = dedupeLocations([
    ...collectWordLocations(target.exportedDocument, target.exportedName),
    ...documents.flatMap((candidate) => collectLinkedImportReferences(candidate, target, resolveImportTarget)),
  ]);
  if (includeDeclaration) {
    return references;
  }

  const declarationKeys = new Set(
    (collectExportedSymbolLocations(target.exportedDocument).get(target.exportedName) ?? []).map((location) => locationKey(location)),
  );
  return references.filter((location) => !declarationKeys.has(locationKey(location)));
}

export function findDocumentHighlights(document: TextDocument, position: Position): DocumentHighlight[] {
  const word = getWordAtPosition(document, position);
  return word
    ? collectWordLocations(document, word).map((location) => ({ range: location.range, kind: DocumentHighlightKind.Text }))
    : [];
}

export function collectRelativeImportDocumentLinks(
  document: TextDocument,
  resolveImportTarget: (specifier: string) => TextDocument | null,
): DocumentLink[] {
  return collectImportContexts(document)
    .filter((context) => context.specifier.startsWith("."))
    .flatMap((context) => {
      const target = resolveImportTarget(context.specifier);
      return target && !target.uri.endsWith(".d.ts") ? [{ range: context.range, target: target.uri }] : [];
    });
}

export function buildRenameEdit(
  documents: TextDocument[],
  document: TextDocument,
  position: Position,
  newName: string,
): WorkspaceEdit | null {
  const member = findDocumentMemberSymbolAtPosition(document, position);
  if (member) {
    const trimmedName = newName.trim();
    if (!trimmedName || member.name === trimmedName) {
      return null;
    }

    const changes: Record<string, TextEdit[]> = {};
    addEdits(changes, document.uri, collectScopedWordLocations(document, member.name, member.scopeRange), trimmedName);
    return Object.keys(changes).length > 0 ? { changes: dedupeTextEdits(changes) } : null;
  }

  const oldName = getWordAtPosition(document, position);
  if (!oldName || !newName.trim() || oldName === newName) {
    return null;
  }

  const changes: Record<string, TextEdit[]> = {};
  for (const candidate of documents) {
    addEdits(changes, candidate.uri, collectWordLocations(candidate, oldName), newName);
  }
  return Object.keys(changes).length > 0 ? { changes } : null;
}

export function buildLinkedRenameEdit(
  documents: TextDocument[],
  document: TextDocument,
  position: Position,
  newName: string,
  resolveImportTarget: (documentUri: string, specifier: string) => TextDocument | null,
): WorkspaceEdit | null {
  const trimmedName = newName.trim();
  if (!trimmedName) {
    return null;
  }

  const importBinding = getImportBindingAtPosition(document, position);
  if (importBinding && importBinding.importedName !== importBinding.localName) {
    return buildAliasRenameEdit(document, importBinding, position, trimmedName);
  }

  const target = resolveLinkedReferenceTarget(documents, document, position, resolveImportTarget);
  if (!target || target.exportedName === trimmedName) {
    return null;
  }

  const changes: Record<string, TextEdit[]> = {};
  addEdits(changes, target.exportedDocument.uri, collectWordLocations(target.exportedDocument, target.exportedName), trimmedName);

  for (const candidate of documents) {
    const bindings = collectImportBindings(candidate).filter((binding) => {
      const targetDocument = resolveImportTarget(candidate.uri, binding.specifier);
      return targetDocument?.uri === target.exportedDocument.uri && binding.importedName === target.exportedName;
    });
    for (const binding of bindings) {
      addEdits(changes, candidate.uri, [{ uri: candidate.uri, range: binding.range }], trimmedName);
      if (binding.localName === binding.importedName) {
        addEdits(changes, candidate.uri, collectWordLocations(candidate, binding.localName), trimmedName);
      }
    }
  }

  return Object.keys(changes).length > 0 ? { changes: dedupeTextEdits(changes) } : null;
}

export function resolveLinkedReferenceTarget(
  documents: TextDocument[],
  document: TextDocument,
  position: Position,
  resolveImportTarget: (documentUri: string, specifier: string) => TextDocument | null,
): LinkedReferenceTarget | null {
  const bindingAtPosition = getImportBindingAtPosition(document, position);
  if (bindingAtPosition) {
    const targetDocument = resolveImportTarget(document.uri, bindingAtPosition.specifier);
    if (targetDocument) {
      return { exportedName: bindingAtPosition.importedName, exportedDocument: targetDocument };
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
      return { exportedName: importedBinding.importedName, exportedDocument: targetDocument };
    }
  }

  const exportedLocations = collectExportedSymbolLocations(document).get(word) ?? [];
  if (exportedLocations.some((location) => isPositionWithinRange(position, location.range))) {
    return { exportedName: word, exportedDocument: document };
  }

  const importedDocuments = documents.filter((candidate) =>
    collectImportBindings(candidate).some((binding) => {
      const targetDocument = resolveImportTarget(candidate.uri, binding.specifier);
      return targetDocument?.uri === document.uri && binding.importedName === word;
    }),
  );
  return importedDocuments.length > 0 && exportedLocations.length > 0 ? { exportedName: word, exportedDocument: document } : null;
}

function collectLinkedImportReferences(
  document: TextDocument,
  target: LinkedReferenceTarget,
  resolveImportTarget: (documentUri: string, specifier: string) => TextDocument | null,
): Location[] {
  return collectImportBindings(document)
    .filter((binding) => {
      const resolvedTarget = resolveImportTarget(document.uri, binding.specifier);
      return resolvedTarget?.uri === target.exportedDocument.uri && binding.importedName === target.exportedName;
    })
    .flatMap((binding) => collectWordLocations(document, binding.localName));
}

function buildAliasRenameEdit(
  document: TextDocument,
  binding: ImportBinding,
  position: Position,
  newName: string,
): WorkspaceEdit | null {
  const currentName = isPositionWithinRange(position, binding.range) ? binding.localName : getWordAtPosition(document, position);
  if (!currentName || currentName === newName) {
    return null;
  }

  const changes: Record<string, TextEdit[]> = {};
  addEdits(changes, document.uri, collectWordLocations(document, binding.localName), newName);
  return Object.keys(changes).length > 0 ? { changes: dedupeTextEdits(changes) } : null;
}

function addEdits(changes: Record<string, TextEdit[]>, uri: string, locations: Location[], newText: string): void {
  if (locations.length === 0) {
    return;
  }
  changes[uri] = [
    ...(changes[uri] ?? []),
    ...locations.map((location) => ({ range: location.range, newText })),
  ];
}

function collectScopedWordLocations(
  document: TextDocument,
  word: string,
  scopeRange: { start: Position; end: Position },
): Location[] {
  return collectWordLocations(document, word).filter((location) => isPositionWithinRange(location.range.start, scopeRange));
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

function dedupeTextEdits(changes: Record<string, TextEdit[]>): Record<string, TextEdit[]> {
  return Object.fromEntries(
    Object.entries(changes).map(([uri, edits]) => {
      const seen = new Set<string>();
      const uniqueEdits = edits.filter((edit) => {
        const key = `${uri}:${edit.range.start.line}:${edit.range.start.character}:${edit.range.end.line}:${edit.range.end.character}:${edit.newText}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
      return [uri, uniqueEdits];
    }),
  );
}
