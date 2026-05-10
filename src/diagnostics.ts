import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  findNodesByType,
  getMonitorDecorators,
  getProviderConsumerPairs,
  getStructDeclarations,
  getV2ComponentInfo,
  getWatchDecorators,
  parseArkTS,
} from "./parser.js";
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

    // Validate V2 @Monitor callbacks and observed fields
    validateMonitorCallbacks(tree, diagnostics, settings.maxNumberOfProblems);

    // Validate @Provider/@Consumer key matching
    validateProviderConsumerKeys(tree, diagnostics, settings.maxNumberOfProblems);
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

// ─── V2 @Monitor Validation ────────────────────────────────────────────────

const V2_REACTIVE_DECORATORS = new Set(["Local", "Param", "Event", "Provider", "Consumer"]);

function validateMonitorCallbacks(
  tree: ReturnType<typeof parseArkTS> extends infer T | null ? T : never,
  diagnostics: Diagnostic[],
  maxProblems: number,
): void {
  if (!tree) {
    return;
  }

  const monitors = getMonitorDecorators(tree);
  if (monitors.length === 0) {
    return;
  }

  const structs = getStructDeclarations(tree);

  // Build method set per struct (same strategy as validateWatchCallbacks)
  const structMethods = new Map<string, Set<string>>();
  // Build reactive field set per struct (V2 reactive decorators only)
  const structReactiveFields = new Map<string, Set<string>>();

  for (const struct of structs) {
    const methods = new Set<string>();
    const reactiveFields = new Set<string>();

    const classBody = struct.node.children.find((c) => c.type === "class_body");
    if (classBody) {
      for (const child of classBody.children) {
        // Collect method names
        if (child.type === "method_definition") {
          const name = child.children.find((c) => c.type === "property_identifier")?.text;
          if (name) {
            methods.add(name);
          }
        }
        // ERROR recovery: methods inside ERROR → public_field_definition
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

          // Collect reactive field names from V2 decorators
          const fieldName = child.children.find((c) => c.type === "property_identifier")?.text;
          if (fieldName) {
            const decoNames = getDecoratorNamesForField(child);
            if (decoNames.some((d) => V2_REACTIVE_DECORATORS.has(d))) {
              reactiveFields.add(fieldName);
            }
          }
        }
      }
    }

    // Fallback: scan by line range
    if (methods.size === 0) {
      const structStart = struct.node.startPosition.line;
      const structEnd = struct.node.endPosition.line;
      const callExprs = findNodesByType(tree, "call_expression");
      for (const call of callExprs) {
        if (call.startPosition.line >= structStart && call.startPosition.line <= structEnd) {
          const name = call.children.find((c) => c.type === "identifier")?.text;
          if (name && !/^[A-Z]/u.test(name)) {
            methods.add(name);
          }
        }
      }
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
    structReactiveFields.set(struct.name, reactiveFields);
  }

  for (const monitor of monitors) {
    if (diagnostics.length >= maxProblems) {
      break;
    }

    // Check 1: callback method must exist
    const methods = structMethods.get(monitor.structName);
    if (methods && !methods.has(monitor.callbackName)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: monitor.node.startPosition,
          end: monitor.node.endPosition,
        },
        message: `@Monitor callback \`${monitor.callbackName}\` not found in \`${monitor.structName}\`. Did you misspell the callback name?`,
        source: "arkts-lsp",
      });
    }

    // Check 2: observed fields must be V2 reactive fields
    const reactiveFields = structReactiveFields.get(monitor.structName);
    if (reactiveFields) {
      for (const field of monitor.observedFields) {
        if (diagnostics.length >= maxProblems) {
          break;
        }
        if (!reactiveFields.has(field)) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: monitor.node.startPosition,
              end: monitor.node.endPosition,
            },
            message: `@Monitor observed field \`${field}\` is not a V2 reactive field (requires @Local, @Param, @Event, @Provider, or @Consumer) in \`${monitor.structName}\`.`,
            source: "arkts-lsp",
          });
        }
      }
    }
  }
}

function getDecoratorNamesForField(fieldNode: import("./parser.js").ArkTSNode): string[] {
  const names: string[] = [];
  // Direct decorator children
  for (const child of fieldNode.children) {
    if (child.type === "decorator") {
      const callExpr = child.children.find((c) => c.type === "call_expression");
      const name = callExpr
        ? callExpr.children.find((c) => c.type === "identifier")?.text
        : child.children.find((c) => c.type === "identifier")?.text;
      if (name) {
        names.push(name);
      }
    }
    // ERROR recovery: decorator inside ERROR child
    if (child.type === "ERROR") {
      for (const errChild of child.children) {
        if (errChild.type === "decorator") {
          const callExpr = errChild.children.find((c) => c.type === "call_expression");
          const name = callExpr
            ? callExpr.children.find((c) => c.type === "identifier")?.text
            : errChild.children.find((c) => c.type === "identifier")?.text;
          if (name) {
            names.push(name);
          }
        }
      }
    }
  }
  return names;
}

// ─── @Provider/@Consumer Key Validation ─────────────────────────────────────

function validateProviderConsumerKeys(
  tree: ReturnType<typeof parseArkTS> extends infer T | null ? T : never,
  diagnostics: Diagnostic[],
  maxProblems: number,
): void {
  if (!tree) {
    return;
  }

  const pairs = getProviderConsumerPairs(tree);
  if (pairs.length === 0) {
    return;
  }

  // Global provider key set — cross-struct matches are valid
  const globalProviderKeys = new Set(
    pairs.filter((p) => p.kind === "Provider").map((p) => p.key),
  );

  // Group by struct for within-struct analysis
  const byStruct = new Map<string, typeof pairs>();
  for (const pair of pairs) {
    const existing = byStruct.get(pair.structName) ?? [];
    existing.push(pair);
    byStruct.set(pair.structName, existing);
  }

  const structNames = Array.from(byStruct.keys());
  for (let si = 0; si < structNames.length && diagnostics.length < maxProblems; si += 1) {
    const structName = structNames[si];
    const structPairs = byStruct.get(structName)!;

    const providers = structPairs.filter((p) => p.kind === "Provider");
    const consumers = structPairs.filter((p) => p.kind === "Consumer");

    const sameStructProviderKeys = new Set(providers.map((p) => p.key));

    // Check: each Consumer should have a matching Provider somewhere
    // (same struct or any other struct — cross-component Provider is valid)
    for (const consumer of consumers) {
      if (diagnostics.length >= maxProblems) {
        break;
      }
      // Only warn if no Provider with this key exists anywhere in the file
      if (!globalProviderKeys.has(consumer.key)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: consumer.node.startPosition,
            end: consumer.node.endPosition,
          },
          message: `@Consumer key \`${consumer.key}\` has no matching @Provider in this file. Ensure a @Provider with the same key exists in an ancestor component.`,
          source: "arkts-lsp",
        });
      } else if (!sameStructProviderKeys.has(consumer.key)) {
        // Cross-struct match — informational hint only
        diagnostics.push({
          severity: DiagnosticSeverity.Hint,
          range: {
            start: consumer.node.startPosition,
            end: consumer.node.endPosition,
          },
          message: `@Consumer key \`${consumer.key}\` matches a @Provider in another component. Ensure the Provider component is an ancestor in the component tree.`,
          source: "arkts-lsp",
        });
      }
    }

    // Check: each Provider should ideally be consumed (informational)
    const sameStructConsumerKeys = new Set(consumers.map((c) => c.key));
    for (const provider of providers) {
      if (diagnostics.length >= maxProblems) {
        break;
      }
      if (!sameStructConsumerKeys.has(provider.key)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Hint,
          range: {
            start: provider.node.startPosition,
            end: provider.node.endPosition,
          },
          message: `@Provider key \`${provider.key}\` is not consumed in \`${structName}\`. It may be consumed in a descendant component.`,
          source: "arkts-lsp",
        });
      }
    }
  }
}
