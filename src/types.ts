import { Position, SymbolInformation } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";

export type ServerSettings = {
  maxNumberOfProblems: number;
};

export type DefinitionContext = {
  document: TextDocument;
  symbols: SymbolInformation[];
};

export type LinkedReferenceTarget = {
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

export type NamedImportContext = {
  specifier: string;
  importedPrefix: string;
  range: {
    start: Position;
    end: Position;
  };
};

export type MemberAccessContext = {
  receiver: string;
  prefix: string;
  range: {
    start: Position;
    end: Position;
  };
};

export type CallContext = {
  callee: string;
  argumentIndex: number;
};
