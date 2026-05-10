import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { findNodesByType, getStructDeclarations, getWatchDecorators, parseArkTS } from "./parser.js";
import { ServerSettings } from "./types.js";

export function collectDiagnostics(textDocument: TextDocument, settings: ServerSettings): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = textDocument.getText().split(/\r?\n/u);

  for (let index = 0; index < lines.length && diagnostics.length < settings.maxNumberOfProblems; index += 1) {
    const line = lines[index];

    const todoIndex = line.indexOf("TODO");
    if (todoIndex >= 0) {
      diagnostics.push({
        severity: DiagnosticSeverity.Information,
        range: {
          start: { line: index, character: todoIndex },
          end: { line: index, character: todoIndex + 4 },
        },
        message: "TODO marker found. Consider tracking or resolving it before release.",
        source: "arkts-lsp",
      });
    }
  }

  const tree = parseArkTS(textDocument);
  if (tree) {
    for (const node of findNodesByType(tree, "predefined_type")) {
      if (diagnostics.length >= settings.maxNumberOfProblems) {
        break;
      }
      if (node.text !== "any" || node.parent?.type !== "type_annotation") {
        continue;
      }
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: node.startPosition,
          end: node.endPosition,
        },
        message: "Avoid `any` where possible. Prefer a concrete ArkTS-friendly type.",
        source: "arkts-lsp",
      });
    }

    // Validate @Watch callback references
    validateWatchCallbacks(tree, diagnostics, settings.maxNumberOfProblems);
  }

  return diagnostics;
}

function validateWatchCallbacks(tree: ReturnType<typeof parseArkTS> extends infer T | null ? T : never, diagnostics: Diagnostic[], maxProblems: number): void {
  if (!tree) {
    return;
  }

  const watches = getWatchDecorators(tree);
  if (watches.length === 0) {
    return;
  }

  const structs = getStructDeclarations(tree);

  // Build a set of all method/callback names per struct — use multiple strategies
  // to handle ERROR recovery where methods may appear in unexpected AST locations
  const structMethods = new Map<string, Set<string>>();
  for (const struct of structs) {
    const methods = new Set<string>();

    // Strategy 1: class_body direct children
    const classBody = struct.node.children.find((c) => c.type === "class_body");
    if (classBody) {
      for (const child of classBody.children) {
        if (child.type === "method_definition") {
          const name = child.children.find((c) => c.type === "property_identifier")?.text;
          if (name) {
            methods.add(name);
          }
        }
        // ERROR recovery: methods may appear as call_expression inside ERROR
        if (child.type === "public_field_definition") {
          for (const sub of child.children) {
            if (sub.type === "ERROR") {
              for (const errChild of sub.children) {
                if (errChild.type === "call_expression") {
                  const name = errChild.children.find((c) => c.type === "identifier")?.text;
                  if (name) {
                    methods.add(name);
                  }
                }
              }
            }
          }
        }
      }
    }

    // Strategy 2: fallback — scan all identifiers/call_expressions within struct line range
    // for method-like patterns (e.g., onA() inside ERROR nodes)
    if (methods.size === 0) {
      const structStart = struct.node.startPosition.line;
      const structEnd = struct.node.endPosition.line;
      const callExprs = findNodesByType(tree, "call_expression");
      for (const call of callExprs) {
        if (call.startPosition.line >= structStart && call.startPosition.line <= structEnd) {
          const name = call.children.find((c) => c.type === "identifier")?.text;
          // Only include identifiers that look like callback names (lowerCamelCase, not UI components)
          if (name && !/^[A-Z]/u.test(name)) {
            methods.add(name);
          }
        }
      }
      // Also check method_definition nodes within range
      const methodDefs = findNodesByType(tree, "method_definition");
      for (const method of methodDefs) {
        if (method.startPosition.line >= structStart && method.startPosition.line <= structEnd) {
          const name = method.children.find((c) => c.type === "property_identifier")?.text;
          if (name) {
            methods.add(name);
          }
        }
      }
    }

    structMethods.set(struct.name, methods);
  }

  for (const watch of watches) {
    if (diagnostics.length >= maxProblems) {
      break;
    }

    const methods = structMethods.get(watch.structName);
    if (methods && !methods.has(watch.callbackName)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: watch.node.startPosition,
          end: watch.node.endPosition,
        },
        message: `@Watch callback \`${watch.callbackName}\` not found in \`${watch.structName}\`. Did you misspell the callback name?`,
        source: "arkts-lsp",
      });
    }
  }
}
