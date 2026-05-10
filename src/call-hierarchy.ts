import {
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  CallHierarchyOutgoingCall,
  SymbolKind,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Position } from "vscode-languageserver-types";
import { findNodesByType, getStructDeclarations, parseArkTS, ArkTSNode } from "./parser.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function findMethodAtPosition(tree: ReturnType<typeof parseArkTS>, position: Position): ArkTSNode | null {
  if (!tree) return null;

  const methodDefs = findNodesByType(tree, "method_definition");
  for (const method of methodDefs) {
    const line = method.startPosition.line;
    const endLine = method.endPosition.line;
    if (position.line >= line && position.line <= endLine) {
      // Check position is near the method name
      const nameNode = method.children.find((c: { type: string }) => c.type === "property_identifier");
      if (nameNode) {
        const nameLine = nameNode.startPosition.line;
        const nameStart = nameNode.startPosition.character;
        const nameEnd = nameNode.endPosition.character;
        if (position.line === nameLine && position.character >= nameStart && position.character <= nameEnd) {
          return method;
        }
      }
    }
  }
  return null;
}

function getMethodName(method: ArkTSNode): string {
  const nameNode = method.children.find((c: { type: string }) => c.type === "property_identifier");
  return nameNode?.text ?? "";
}

function getStructNameForMethod(tree: ReturnType<typeof parseArkTS>, method: ArkTSNode): string {
  if (!tree) return "";
  const structs = getStructDeclarations(tree);
  for (const struct of structs) {
    if (method.startPosition.line >= struct.node.startPosition.line &&
        method.startPosition.line <= struct.node.endPosition.line) {
      return struct.name;
    }
  }
  return "";
}

// ─── Prepare Call Hierarchy ─────────────────────────────────────────────────

export function prepareCallHierarchy(
  document: TextDocument,
  position: Position,
): CallHierarchyItem[] {
  const tree = parseArkTS(document);
  if (!tree) return [];

  const method = findMethodAtPosition(tree, position);
  if (!method) return [];

  const name = getMethodName(method);
  const structName = getStructNameForMethod(tree, method);

  return [{
    name,
    kind: SymbolKind.Method,
    uri: document.uri,
    range: {
      start: method.startPosition,
      end: method.endPosition,
    },
    selectionRange: {
      start: method.startPosition,
      end: { line: method.startPosition.line, character: method.startPosition.character + name.length },
    },
    detail: structName ? `${structName}.${name}` : name,
    data: { name, structName, uri: document.uri },
  }];
}

// ─── Incoming Calls ─────────────────────────────────────────────────────────

export function incomingCalls(
  item: CallHierarchyItem,
  documents: TextDocument[],
): CallHierarchyIncomingCall[] {
  const results: CallHierarchyIncomingCall[] = [];
  const targetName = (item.data as { name: string }).name;

  for (const doc of documents) {
    const tree = parseArkTS(doc);
    if (!tree) continue;

    // Find all call_expression nodes referencing targetName
    const callExprs = findNodesByType(tree, "call_expression");
    for (const call of callExprs) {
      const calledName = getCalledFunctionName(call);
      if (calledName !== targetName) continue;

      // Find enclosing method to report as the caller
      const callerMethod = findEnclosingMethod(tree, call);
      if (!callerMethod) continue;

      // Skip self-calls
      const callerName = getMethodName(callerMethod);
      if (callerName === targetName) continue;

      const structName = getStructNameForMethod(tree, callerMethod);

      results.push({
        from: {
          name: callerName,
          kind: SymbolKind.Method,
          uri: doc.uri,
          range: {
            start: callerMethod.startPosition,
            end: callerMethod.endPosition,
          },
          selectionRange: {
            start: callerMethod.startPosition,
            end: { line: callerMethod.startPosition.line, character: callerMethod.startPosition.character + callerName.length },
          },
          detail: structName ? `${structName}.${callerName}` : callerName,
        },
        fromRanges: [{
          start: call.startPosition,
          end: call.endPosition,
        }],
      });
    }
  }

  return results;
}

// ─── Outgoing Calls ─────────────────────────────────────────────────────────

export function outgoingCalls(
  item: CallHierarchyItem,
  documents: TextDocument[],
): CallHierarchyOutgoingCall[] {
  const results: CallHierarchyOutgoingCall[] = [];
  const targetName = (item.data as { name: string }).name;
  const targetUri = (item.data as { uri: string }).uri;

  const sourceDoc = documents.find((d) => d.uri === targetUri);
  if (!sourceDoc) return [];

  const tree = parseArkTS(sourceDoc);
  if (!tree) return [];

  // Find the target method node
  const methodDefs = findNodesByType(tree, "method_definition");
  const targetMethod = methodDefs.find((m) => getMethodName(m) === targetName);
  if (!targetMethod) return [];

  // Find all call_expression nodes within the target method body
  const callExprs = findNodesByType(tree, "call_expression");
  const seenCallees = new Set<string>();

  for (const call of callExprs) {
    // Must be inside target method
    if (call.startPosition.line < targetMethod.startPosition.line ||
        call.startPosition.line > targetMethod.endPosition.line) {
      continue;
    }

    // Component statement calls
    if (call.type === "component_statement") {
      const nameNode = call.children.find((c: { type: string }) =>
        c.type === "identifier" || c.type === "type_identifier");
      if (nameNode && !seenCallees.has(nameNode.text)) {
        seenCallees.add(nameNode.text);
        const toItem = findMethodDefinition(nameNode.text, documents);
        if (toItem) {
          results.push({
            to: toItem,
            fromRanges: [{ start: call.startPosition, end: call.endPosition }],
          });
        }
      }
      continue;
    }

    const calledName = getCalledFunctionName(call);
    if (!calledName || calledName === targetName || calledName === "this") continue;
    if (seenCallees.has(calledName)) continue;
    seenCallees.add(calledName);

    // Try to find the callee definition
    const toItem = findMethodDefinition(calledName, documents);
    if (toItem) {
      results.push({
        to: toItem,
        fromRanges: [{ start: call.startPosition, end: call.endPosition }],
      });
    }
  }

  return results;
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function getCalledFunctionName(call: ArkTSNode): string {
  // Direct call: funcName(args)
  const nameNode = call.children.find((c: { type: string }) =>
    c.type === "identifier" || c.type === "property_identifier");
  if (nameNode) return nameNode.text;

  // Member call: this.funcName(args) or obj.funcName(args)
  const memberExpr = call.children.find((c: { type: string }) => c.type === "member_expression");
  if (memberExpr) {
    const prop = memberExpr.children.find((c: { type: string }) =>
      c.type === "property_identifier");
    if (prop) return prop.text;
  }

  return "";
}

function findEnclosingMethod(tree: ReturnType<typeof parseArkTS>, node: ArkTSNode): ArkTSNode | null {
  if (!tree) return null;
  const methodDefs = findNodesByType(tree, "method_definition");
  for (const method of methodDefs) {
    if (node.startPosition.line >= method.startPosition.line &&
        node.startPosition.line <= method.endPosition.line) {
      return method;
    }
  }
  return null;
}

function findMethodDefinition(name: string, documents: TextDocument[]): CallHierarchyItem | null {
  for (const doc of documents) {
    const tree = parseArkTS(doc);
    if (!tree) continue;

    const methodDefs = findNodesByType(tree, "method_definition");
    for (const method of methodDefs) {
      const methodName = getMethodName(method);
      if (methodName === name) {
        const structName = getStructNameForMethod(tree, method);
        return {
          name: methodName,
          kind: SymbolKind.Method,
          uri: doc.uri,
          range: {
            start: method.startPosition,
            end: method.endPosition,
          },
          selectionRange: {
            start: method.startPosition,
            end: { line: method.startPosition.line, character: method.startPosition.character + methodName.length },
          },
          detail: structName ? `${structName}.${methodName}` : methodName,
        };
      }
    }
  }
  return null;
}
