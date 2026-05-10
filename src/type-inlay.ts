import type { ArkTSTree } from "./parser.js";
import { findNodesByType } from "./parser.js";
import { extractTypeAnnotation } from "./type-model.js";

/**
 * Infer a TypeScript/ArkTS type name from a literal initializer text.
 *
 * Supports: number literals, string literals, template literals,
 * boolean literals, and `new ClassName()` expressions.
 * Returns null if the type cannot be trivially inferred.
 */
export function inferTypeFromInitializer(initializerText: string): string | null {
  const trimmed = initializerText.trim();

  // new X(...) → X
  const newMatch = trimmed.match(/^new\s+([A-Za-z_]\w*)\s*\(/u);
  if (newMatch) {
    return newMatch[1];
  }

  // Numeric literal (integer or float)
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(trimmed)) {
    return "number";
  }

  // Boolean literal
  if (trimmed === "true" || trimmed === "false") {
    return "boolean";
  }

  // Template literal
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
    return "string";
  }

  // String literal (single or double quoted)
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return "string";
  }

  // null / undefined
  if (trimmed === "null") return "null";
  if (trimmed === "undefined") return "undefined";

  return null;
}

/**
 * Build inlay hints for variables without explicit type annotations,
 * showing the inferred type from the initializer.
 *
 * Uses tree-sitter named children: for `let count = 42`,
 * the variable_declarator has named children [identifier, number].
 * The value node is the last child (skipping type_annotation if present).
 */
export function buildTypeInlayHints(
  tree: ArkTSTree,
): Array<{ position: { line: number; character: number }; label: string }> {
  const hints: Array<{ position: { line: number; character: number }; label: string }> = [];

  const declarators = findNodesByType(tree, "variable_declarator");
  for (const decl of declarators) {
    // Skip if it already has a type annotation
    if (extractTypeAnnotation(decl)) continue;

    // Find the identifier (variable name) — always the first named child
    const idNode = decl.children.find((c) => c.type === "identifier");
    if (!idNode) continue;

    // The value is the last named child (namedChild excludes "=" sign)
    // variable_declarator without type: [identifier, valueNode]
    // variable_declarator with type:    [identifier, type_annotation, valueNode]
    if (decl.children.length < 2) continue;

    // Filter out type_annotation to find the value node
    const valueNode = decl.children.find(
      (c) => c.type !== "identifier" && c.type !== "type_annotation",
    );
    if (!valueNode) continue;

    const typeName = inferTypeFromInitializer(valueNode.text);
    if (!typeName) continue;

    // Position hint after the identifier name
    hints.push({
      position: {
        line: idNode.endPosition.line,
        character: idNode.endPosition.character,
      },
      label: `: ${typeName}`,
    });
  }

  return hints;
}
