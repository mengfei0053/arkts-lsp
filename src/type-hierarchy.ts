import {
  SymbolKind,
  TypeHierarchyItem,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { findNodesByType, getStructDeclarations, getClassDeclarations, parseArkTS, ArkTSNode } from "./parser.js";

// ─── Prepare Type Hierarchy ─────────────────────────────────────────────────

export function prepareTypeHierarchy(
  document: TextDocument,
  position: { line: number; character: number },
): TypeHierarchyItem[] {
  const tree = parseArkTS(document);
  if (!tree) return [];

  // Check struct declarations
  const structs = getStructDeclarations(tree);
  for (const struct of structs) {
    const line = struct.line;
    const endLine = struct.node.endPosition.line;
    if (position.line >= line && position.line <= endLine) {
      const nameNode = struct.node.children.find(
        (c: { type: string }) => c.type === "type_identifier",
      );
      if (nameNode) {
        const nameLine = nameNode.startPosition.line;
        const nameStart = nameNode.startPosition.character;
        const nameEnd = nameNode.endPosition.character;
        if (position.line === nameLine && position.character >= nameStart && position.character <= nameEnd) {
          return [makeTypeItem(struct.name, document.uri, struct.node, struct.decorators)];
        }
      }
      return [makeTypeItem(struct.name, document.uri, struct.node, struct.decorators)];
    }
  }

  // Check class declarations
  const classDecls = getClassDeclarations(tree);
  for (const classDecl of classDecls) {
    if (position.line >= classDecl.node.startPosition.line &&
        position.line <= classDecl.node.endPosition.line) {
      const nameNode = classDecl.node.children.find(
        (c: { type: string }) => c.type === "type_identifier",
      );
      if (nameNode) {
        const nameLine = nameNode.startPosition.line;
        const nameStart = nameNode.startPosition.character;
        const nameEnd = nameNode.endPosition.character;
        if (position.line === nameLine && position.character >= nameStart && position.character <= nameEnd) {
          return [{
            name: classDecl.name,
            kind: SymbolKind.Class,
            uri: document.uri,
            range: {
              start: classDecl.node.startPosition,
              end: classDecl.node.endPosition,
            },
            selectionRange: {
              start: classDecl.node.startPosition,
              end: { line: classDecl.node.startPosition.line, character: classDecl.node.startPosition.character + classDecl.name.length },
            },
            detail: classDecl.decorators.length > 0 ? classDecl.decorators.join(", ") : "class",
            data: { name: classDecl.name, uri: document.uri },
          }];
        }
      }
      return [{
        name: classDecl.name,
        kind: SymbolKind.Class,
        uri: document.uri,
        range: {
          start: classDecl.node.startPosition,
          end: classDecl.node.endPosition,
        },
        selectionRange: {
          start: classDecl.node.startPosition,
          end: { line: classDecl.node.startPosition.line, character: classDecl.node.startPosition.character + classDecl.name.length },
        },
        detail: classDecl.decorators.length > 0 ? classDecl.decorators.join(", ") : "class",
        data: { name: classDecl.name, uri: document.uri },
      }];
    }
  }

  return [];
}

// ─── Supertypes (what this type uses) ────────────────────────────────────────

export function supertypes(
  item: TypeHierarchyItem,
  documents: TextDocument[],
): TypeHierarchyItem[] {
  const results: TypeHierarchyItem[] = [];
  const sourceDoc = documents.find((d) => d.uri === item.uri);
  if (!sourceDoc) return [];

  const tree = parseArkTS(sourceDoc);
  if (!tree) return [];

  // Find the struct node
  const structs = getStructDeclarations(tree);
  const targetStruct = structs.find((s) => s.name === item.name);
  if (!targetStruct) return [];

  // Find all component_statement nodes inside build() method of this struct
  // These are the types this struct depends on (uses)
  const compStmts = findNodesByType(tree, "component_statement");
  const usedNames = new Set<string>();

  for (const stmt of compStmts) {
    // Must be inside the target struct
    if (stmt.startPosition.line < targetStruct.node.startPosition.line ||
        stmt.startPosition.line > targetStruct.node.endPosition.line) {
      continue;
    }

    const nameNode = stmt.children.find(
      (c: { type: string }) => c.type === "identifier" || c.type === "type_identifier",
    );
    if (!nameNode) continue;

    const name = nameNode.text;
    // Skip built-in components
    if (name === "Text" || name === "Row" || name === "Column" || name === "Button" ||
        name === "Image" || name === "List" || name === "ForEach" || name === "If" ||
        name === "Else" || name === "Stack" || name === "Flex" || name === "Grid") {
      continue;
    }

    if (usedNames.has(name)) continue;
    usedNames.add(name);

    // Try to find the used component's definition across all documents
    const def = findStructDefinition(name, documents);
    if (def) {
      results.push(def);
    }
  }

  return results;
}

// ─── Subtypes (what uses this type) ──────────────────────────────────────────

export function subtypes(
  item: TypeHierarchyItem,
  documents: TextDocument[],
): TypeHierarchyItem[] {
  const results: TypeHierarchyItem[] = [];

  // Scan all documents for component_statement nodes that reference this struct
  for (const doc of documents) {
    const tree = parseArkTS(doc);
    if (!tree) continue;

    const compStmts = findNodesByType(tree, "component_statement");
    for (const stmt of compStmts) {
      const nameNode = stmt.children.find(
        (c: { type: string }) => c.type === "identifier" || c.type === "type_identifier",
      );
      if (!nameNode || nameNode.text !== item.name) continue;

      // Find the enclosing struct to report as the user
      const usedBy = findEnclosingStruct(tree, stmt);
      if (!usedBy || usedBy.name === item.name) continue;

      // Check if already added
      if (results.some((r) => r.name === usedBy.name && r.uri === doc.uri)) continue;

      results.push(makeTypeItem(usedBy.name, doc.uri, usedBy.node, usedBy.decorators));
    }
  }

  return results;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTypeItem(
  name: string,
  uri: string,
  node: ArkTSNode,
  decorators: string[],
): TypeHierarchyItem {
  return {
    name,
    kind: SymbolKind.Struct,
    uri,
    range: {
      start: node.startPosition,
      end: node.endPosition,
    },
    selectionRange: {
      start: node.startPosition,
      end: { line: node.startPosition.line, character: node.startPosition.character + name.length },
    },
    detail: decorators.length > 0 ? decorators.join(", ") : "struct",
    data: { name, uri },
  };
}

function findStructDefinition(name: string, documents: TextDocument[]): TypeHierarchyItem | null {
  for (const doc of documents) {
    const tree = parseArkTS(doc);
    if (!tree) continue;

    const structs = getStructDeclarations(tree);
    const found = structs.find((s) => s.name === name);
    if (found) {
      return makeTypeItem(found.name, doc.uri, found.node, found.decorators);
    }
  }
  return null;
}

function findEnclosingStruct(
  tree: ReturnType<typeof parseArkTS>,
  node: ArkTSNode,
): { name: string; node: ArkTSNode; decorators: string[] } | null {
  if (!tree) return null;

  const structs = getStructDeclarations(tree);
  for (const struct of structs) {
    if (node.startPosition.line >= struct.node.startPosition.line &&
        node.startPosition.line <= struct.node.endPosition.line) {
      return struct;
    }
  }
  return null;
}
