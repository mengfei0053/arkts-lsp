import {
  CodeAction,
  CodeLens,
  CompletionItem,
  createConnection,
  DidChangeConfigurationNotification,
  DocumentHighlight,
  DocumentLink,
  FoldingRange,
  Hover,
  InlayHint,
  InitializeParams,
  InitializeResult,
  Location,
  ProposedFeatures,
  SemanticTokens,
  SignatureHelp,
  WorkspaceEdit,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments } from "vscode-languageserver";
import { clearParseCache } from "./parser.js";
import {
  buildCodeLenses,
  buildFoldingRanges,
  buildImportCompletionItems,
  buildClassMemberCompletionItems,
  buildLinkedRenameEdit,
  buildLinkedHover,
  buildNamedImportCompletionItems,
  buildInlayHints,
  buildSignatureHelp,
  buildSelectionRangeResponse,
  buildCompletionItems,
  buildCodeActions,
  buildRenameEdit,
  buildSemanticTokens,
  collectDiagnostics,
  collectDocumentSymbols,
  collectHierarchicalDocumentSymbols,
  collectRelativeImportDocumentLinks,
  collectExportedSymbolLocations,
  collectWorkspaceSymbols,
  findDefinitions,
  findDocumentHighlights,
  findLinkedReferences,
  findReferencesWithOptions,
  getImportBindingAtPosition,
  getImportContextAtPosition,
  getEnclosingTypeContextAtPosition,
  getMemberAccessContextAtPosition,
  getNamedImportContextAtPosition,
  ServerSettings,
} from "./core.js";
import {
  buildProjectContext,
  collectWorkspaceProjectContexts,
  listRelativeModuleSpecifiers,
  loadDocumentFromUri,
  resolveRelativeModule,
} from "./project.js";
import { buildServerCapabilities } from "./server-capabilities.js";
import { indexWorkspace, indexDocument, removeDocumentFromIndex } from "./workspace-indexer.js";

const defaultSettings: ServerSettings = { maxNumberOfProblems: 100 };
const globalSettings: ServerSettings = defaultSettings;

const connection = createConnection(ProposedFeatures.all, process.stdin, process.stdout);
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;
  hasConfigurationCapability = Boolean(capabilities.workspace?.configuration);

  return {
    capabilities: buildServerCapabilities(),
  };
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  // Index all already-open documents at startup
  const count = indexWorkspace(documents.all());
  if (count > 0) {
    connection.console.log(`arkts-lsp: indexed ${count} workspace documents`);
  }
});

documents.onDidOpen(({ document }) => {
  indexDocument(document);
});

connection.onDidChangeConfiguration(() => {
  documents.all().forEach(validateTextDocument);
});

documents.onDidClose((event) => {
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
  removeDocumentFromIndex(event.document.uri);
});

documents.onDidChangeContent((change) => {
  indexDocument(change.document);
  void validateTextDocument(change.document);
});

connection.onHover(({ textDocument, position }): Hover | null => {
  const document = loadDocumentFromUri(textDocument.uri, documents.all());
  if (!document) {
    return null;
  }

  const project = buildProjectContext(textDocument.uri, documents.all());
  return buildLinkedHover(project.documents, document, position, (documentUri, specifier) =>
    resolveRelativeModule(documentUri, specifier, project.documents),
  );
});

connection.onDocumentSymbol(({ textDocument }) => {
  const document = loadDocumentFromUri(textDocument.uri, documents.all());
  if (!document) {
    return [];
  }

  return collectHierarchicalDocumentSymbols(document);
});

connection.onWorkspaceSymbol(({ query }) => {
  return collectWorkspaceProjectContexts(documents.all()).flatMap((context) => collectWorkspaceSymbols(context.documents, query));
});

connection.onDefinition(({ textDocument, position }) => {
  const document = loadDocumentFromUri(textDocument.uri, documents.all());
  if (!document) {
    return [];
  }

  const project = buildProjectContext(textDocument.uri, documents.all());
  const importContext = getImportContextAtPosition(document, position);
  if (importContext) {
    const target = resolveRelativeModule(textDocument.uri, importContext.specifier, project.documents);
    if (target) {
      return [
        {
          uri: target.uri,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
        },
      ];
    }
  }

  const importBinding = getImportBindingAtPosition(document, position);
  if (importBinding) {
    const target = resolveRelativeModule(textDocument.uri, importBinding.specifier, project.documents);
    if (target) {
      const exportedSymbols = collectExportedSymbolLocations(target).get(importBinding.importedName);
      if (exportedSymbols && exportedSymbols.length > 0) {
        return exportedSymbols;
      }
    }
  }

  return findDefinitions({
    document,
    documents: project.documents,
    symbols: project.documents.flatMap((candidate) => collectDocumentSymbols(candidate)),
  }, position);
});

connection.onReferences(({ textDocument, position, context }): Location[] => {
  const document = loadDocumentFromUri(textDocument.uri, documents.all());
  if (!document) {
    return [];
  }

  const project = buildProjectContext(textDocument.uri, documents.all());
  const linkedReferences = findLinkedReferences(
    project.documents,
    document,
    position,
    context.includeDeclaration ?? true,
    (documentUri, specifier) => resolveRelativeModule(documentUri, specifier, project.documents),
  );
  if (linkedReferences.length > 0) {
    return linkedReferences;
  }

  return findReferencesWithOptions(project.documents, document, position, context.includeDeclaration ?? true);
});

connection.onDocumentHighlight(({ textDocument, position }): DocumentHighlight[] => {
  const document = loadDocumentFromUri(textDocument.uri, documents.all());
  if (!document) {
    return [];
  }

  return findDocumentHighlights(document, position);
});

connection.onDocumentLinks(({ textDocument }): DocumentLink[] => {
  const document = loadDocumentFromUri(textDocument.uri, documents.all());
  if (!document) {
    return [];
  }

  const project = buildProjectContext(textDocument.uri, documents.all());
  return collectRelativeImportDocumentLinks(document, (specifier) =>
    resolveRelativeModule(textDocument.uri, specifier, project.documents),
  );
});

connection.onSelectionRanges(({ textDocument, positions }) => {
  const document = loadDocumentFromUri(textDocument.uri, documents.all());
  return buildSelectionRangeResponse(document, positions);
});

connection.onFoldingRanges(({ textDocument }): FoldingRange[] => {
  const document = loadDocumentFromUri(textDocument.uri, documents.all());
  if (!document) {
    return [];
  }
  return buildFoldingRanges(document);
});

connection.onCodeLens((params): CodeLens[] => {
  const document = loadDocumentFromUri(params.textDocument.uri, documents.all());
  if (!document) {
    return [];
  }
  return buildCodeLenses(document, params);
});

connection.languages.inlayHint.on(({ textDocument, range }): InlayHint[] => {
  const document = loadDocumentFromUri(textDocument.uri, documents.all());
  if (!document) {
    return [];
  }

  const project = buildProjectContext(textDocument.uri, documents.all());
  return buildInlayHints(project.documents, document, range, (documentUri, specifier) =>
    resolveRelativeModule(documentUri, specifier, project.documents),
  );
});

connection.languages.semanticTokens.on(({ textDocument }): SemanticTokens => {
  const document = loadDocumentFromUri(textDocument.uri, documents.all());
  if (!document) {
    return { data: [] };
  }

  return buildSemanticTokens(document);
});

connection.onCodeAction(({ textDocument, context }): CodeAction[] => {
  const document = loadDocumentFromUri(textDocument.uri, documents.all());
  if (!document) {
    return [];
  }

  return buildCodeActions(document, context.diagnostics);
});

connection.onCompletion(({ textDocument, position }): CompletionItem[] => {
  const document = loadDocumentFromUri(textDocument.uri, documents.all());
  if (!document) {
    return [];
  }

  const project = buildProjectContext(textDocument.uri, documents.all());
  const memberAccessContext = getMemberAccessContextAtPosition(document, position);
  if (memberAccessContext) {
    if (memberAccessContext.receiver === "this") {
      const enclosingType = getEnclosingTypeContextAtPosition(document, position);
      if (enclosingType) {
        const items = buildClassMemberCompletionItems(document, enclosingType.name, memberAccessContext.prefix, "instance");
        if (items.length > 0) {
          return items;
        }
      }
    }

    const importBinding = getImportBindingAtPosition(
      document,
      {
        line: memberAccessContext.range.start.line,
        character: memberAccessContext.range.start.character + memberAccessContext.receiver.length - 1,
      },
    );
    if (importBinding) {
      const target = resolveRelativeModule(textDocument.uri, importBinding.specifier, project.documents);
      if (target) {
        const items = buildClassMemberCompletionItems(target, importBinding.importedName, memberAccessContext.prefix);
        if (items.length > 0) {
          return items;
        }
      }
    }

    const localItems = buildClassMemberCompletionItems(document, memberAccessContext.receiver, memberAccessContext.prefix);
    if (localItems.length > 0) {
      return localItems;
    }
  }

  const namedImportContext = getNamedImportContextAtPosition(document, position);
  if (namedImportContext) {
    const target = resolveRelativeModule(textDocument.uri, namedImportContext.specifier, project.documents);
    if (target) {
      return buildNamedImportCompletionItems(document, position, target);
    }
  }

  const importContext = getImportContextAtPosition(document, position);
  if (importContext) {
    return buildImportCompletionItems(listRelativeModuleSpecifiers(textDocument.uri, importContext.specifier, project.documents));
  }

  return buildCompletionItems(project.documents, document, position);
});

connection.onRenameRequest(({ textDocument, position, newName }): WorkspaceEdit | null => {
  const document = loadDocumentFromUri(textDocument.uri, documents.all());
  if (!document) {
    return null;
  }

  const project = buildProjectContext(textDocument.uri, documents.all());
  const linkedEdit = buildLinkedRenameEdit(
    project.documents,
    document,
    position,
    newName,
    (documentUri, specifier) => resolveRelativeModule(documentUri, specifier, project.documents),
  );
  if (linkedEdit) {
    return linkedEdit;
  }

  return buildRenameEdit(project.documents, document, position, newName);
});

connection.onSignatureHelp(({ textDocument, position }): SignatureHelp | null => {
  const document = loadDocumentFromUri(textDocument.uri, documents.all());
  if (!document) {
    return null;
  }

  const project = buildProjectContext(textDocument.uri, documents.all());
  return buildSignatureHelp(project.documents, document, position, (documentUri, specifier) =>
    resolveRelativeModule(documentUri, specifier, project.documents),
  );
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const settings = await getDocumentSettings(textDocument.uri);
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: collectDiagnostics(textDocument, settings, documents.all()) });
}

async function getDocumentSettings(_resource: string): Promise<ServerSettings> {
  return globalSettings;
}

documents.listen(connection);
connection.listen();
