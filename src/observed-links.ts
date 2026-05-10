import { Location, Position } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { findNodesByType, getDecoratorNames, parseArkTS } from "./parser.js";
import { collectAllTypeMemberSymbols, collectDocumentSymbols, TypeMemberSymbol } from "./symbols.js";
import { isPositionWithinRange } from "./text.js";

export function findObservedTypeDefinitions(documents: TextDocument[], declarationText: string): Location[] {
  const observedTypeName = extractAnnotatedTypeName(declarationText);
  return observedTypeName ? findObservedTypeDeclarationLocations(documents, observedTypeName) : [];
}

export function findObservedTypeDeclarationLocations(documents: TextDocument[], typeName: string): Location[] {
  return documents.flatMap((document) => {
    if (!hasObservedDeclaration(document, typeName)) {
      return [];
    }
    return collectDocumentSymbols(document)
      .filter((symbol) => symbol.name === typeName)
      .map((symbol) => symbol.location);
  });
}

export function findObservedTypeNameAtPosition(document: TextDocument, position: Position): string | null {
  const tree = parseArkTS(document);
  if (!tree) {
    return null;
  }

  for (const type of ["class_declaration", "struct_declaration"] as const) {
    for (const node of findNodesByType(tree, type)) {
      if (!getDecoratorNames(node).includes("Observed")) {
        continue;
      }
      const identifier = node.children.find((child) => child.type === "type_identifier" || child.type === "identifier");
      if (
        identifier
        && isPositionWithinRange(position, {
          start: identifier.startPosition,
          end: identifier.endPosition,
        })
      ) {
        return identifier.text;
      }
    }
  }

  return null;
}

export function findObjectLinkMembersByObservedType(documents: TextDocument[], typeName: string): TypeMemberSymbol[] {
  return documents
    .flatMap((document) => collectAllTypeMemberSymbols(document))
    .filter((member) => member.decorator === "ObjectLink" && extractAnnotatedTypeName(member.declarationText) === typeName);
}

function extractAnnotatedTypeName(declarationText: string): string | null {
  const match = declarationText.match(/:\s*([A-Za-z_]\w*)/u);
  return match?.[1] ?? null;
}

function hasObservedDeclaration(document: TextDocument, typeName: string): boolean {
  const tree = parseArkTS(document);
  if (!tree) {
    return false;
  }

  for (const type of ["class_declaration", "struct_declaration"] as const) {
    const match = findNodesByType(tree, type).find((node) => {
      const identifier = node.children.find((child) => child.type === "type_identifier" || child.type === "identifier");
      return identifier?.text === typeName;
    });
    if (match && getDecoratorNames(match).includes("Observed")) {
      return true;
    }
  }

  return false;
}
