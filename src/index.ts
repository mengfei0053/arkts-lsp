import {
  CompletionItem,
  createConnection,
  DidChangeConfigurationNotification,
  DocumentHighlight,
  Hover,
  InitializeParams,
  InitializeResult,
  Location,
  ProposedFeatures,
  TextDocumentSyncKind,
  WorkspaceEdit,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments } from "vscode-languageserver";
import {
  buildImportCompletionItems,
  buildLinkedRenameEdit,
  buildLinkedHover,
  buildNamedImportCompletionItems,
  buildCompletionItems,
  buildRenameEdit,
  collectDiagnostics,
  collectDocumentSymbols,
  collectExportedSymbolLocations,
  collectWorkspaceSymbols,
  findDefinitions,
  findDocumentHighlights,
  findLinkedReferences,
  findReferencesWithOptions,
  getImportBindingAtPosition,
  getImportContextAtPosition,
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
      referencesProvider: true,
      documentHighlightProvider: true,
      renameProvider: {
        prepareProvider: false,
      },
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [".", "@", ":"],
      },
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

  return collectDocumentSymbols(document);
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

connection.onCompletion(({ textDocument, position }): CompletionItem[] => {
  const document = loadDocumentFromUri(textDocument.uri, documents.all());
  if (!document) {
    return [];
  }

  const project = buildProjectContext(textDocument.uri, documents.all());
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

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const settings = await getDocumentSettings(textDocument.uri);
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: collectDiagnostics(textDocument, settings) });
}

async function getDocumentSettings(_resource: string): Promise<ServerSettings> {
  return globalSettings;
}

documents.listen(connection);
connection.listen();
