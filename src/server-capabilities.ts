import { InitializeResult, TextDocumentSyncKind } from "vscode-languageserver/node.js";
import { semanticTokenLegend } from "./semantic-tokens.js";

export function buildServerCapabilities(): InitializeResult["capabilities"] {
  return {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    hoverProvider: true,
    definitionProvider: true,
    referencesProvider: true,
    documentHighlightProvider: true,
    documentLinkProvider: {
      resolveProvider: false,
    },
    renameProvider: {
      prepareProvider: false,
    },
    documentSymbolProvider: true,
    workspaceSymbolProvider: true,
    foldingRangeProvider: true,
    selectionRangeProvider: true,
    inlayHintProvider: true,
    codeActionProvider: true,
    semanticTokensProvider: {
      legend: semanticTokenLegend,
      full: true,
    },
    completionProvider: {
      resolveProvider: false,
      triggerCharacters: [".", "@", ":"],
    },
    signatureHelpProvider: {
      triggerCharacters: ["(", ","],
    },
  };
}
