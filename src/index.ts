import {
  createConnection,
  DidChangeConfigurationNotification,
  Hover,
  InitializeParams,
  InitializeResult,
  ProposedFeatures,
  TextDocumentSyncKind,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { TextDocuments } from "vscode-languageserver";
import {
  buildHover,
  collectDiagnostics,
  collectDocumentSymbols,
  collectWorkspaceSymbols,
  findDefinitions,
  ServerSettings,
} from "./core.js";

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

  return buildHover(document, position);
});

connection.onDocumentSymbol(({ textDocument }) => {
  const document = documents.get(textDocument.uri);
  if (!document) {
    return [];
  }

  return collectDocumentSymbols(document);
});

connection.onWorkspaceSymbol(({ query }) => {
  return collectWorkspaceSymbols(documents.all(), query);
});

connection.onDefinition(({ textDocument, position }) => {
  const document = documents.get(textDocument.uri);
  if (!document) {
    return [];
  }

  return findDefinitions({
    document,
    symbols: documents.all().flatMap((candidate) => collectDocumentSymbols(candidate)),
  }, position);
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
