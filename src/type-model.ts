import type { ArkTSNode, ArkTSTree } from "./parser.js";

/**
 * Find the deepest node at a given position.
 */
function findNodeAtPosition(
  node: ArkTSNode,
  line: number,
  character: number,
): ArkTSNode | null {
  // Find deepest child that contains the position
  for (const child of node.children) {
    const found = findNodeAtPosition(child, line, character);
    if (found) return found;
  }
  // No child contains it; check if this node itself does
  const { startPosition, endPosition } = node;
  if (
    startPosition.line <= line &&
    endPosition.line >= line &&
    (startPosition.line < line ||
      startPosition.character <= character) &&
    (endPosition.line > line ||
      endPosition.character >= character)
  ) {
    return node;
  }
  return null;
}

/**
 * Extract the type_annotation child node from a variable_declarator,
 * parameter, or other typed node.
 *
 * Returns null if no type annotation is present.
 */
export function extractTypeAnnotation(node: ArkTSNode): ArkTSNode | null {
  return node.children.find((c) => c.type === "type_annotation") ?? null;
}

/**
 * Parse a type_annotation node into a human-readable type name string.
 *
 * Handles: predefined_type, union_type, intersection_type, array_type,
 * generic_type, type_identifier, literal_type, and simple nesting.
 */
export function parseTypeName(typeNode: ArkTSNode): string {
  // Walk down into type_annotation wrapper
  const inner = typeNode.type === "type_annotation"
    ? typeNode.children.find(
        (c) =>
          c.type !== ":" &&
          c.type !== "type" &&
          c.type !== "=",
      )
    : typeNode;

  if (!inner) {
    // Fallback: strip leading ':' and whitespace
    return typeNode.type === "type_annotation"
      ? typeNode.text.replace(/^:\s*/, "")
      : typeNode.text;
  }

  return buildTypeName(inner);
}

function buildTypeName(node: ArkTSNode): string {
  switch (node.type) {
    case "predefined_type":
      return node.text.trim();

    case "type_identifier":
      return node.text.trim();

    case "nested_type_identifier":
      return node.text.trim();

    case "literal_type":
      return node.text.trim();

    case "array_type": {
      const elementType = node.children.find(
        (c) =>
          c.type === "predefined_type" ||
          c.type === "type_identifier" ||
          c.type === "generic_type" ||
          c.type === "nested_type_identifier",
      );
      if (elementType) {
        return buildTypeName(elementType) + "[]";
      }
      return node.text.trim();
    }

    case "generic_type": {
      const base = node.children.find(
        (c) => c.type === "type_identifier" || c.type === "predefined_type",
      );
      const args = node.children.find((c) => c.type === "type_arguments");
      if (!base) return node.text.trim();
      const baseName = buildTypeName(base);
      if (!args) return baseName;
      const argsText = args.children
        .filter(
          (c) =>
            c.type !== "<" &&
            c.type !== ">" &&
            c.type !== ",",
        )
        .map((c) => buildTypeName(c))
        .join(", ");
      return `${baseName}<${argsText}>`;
    }

    case "union_type": {
      const parts: string[] = [];
      for (const child of node.children) {
        if (child.type === "|") continue;
        // Handle nested union_type (3+ members)
        if (child.type === "union_type") {
          parts.push(buildTypeName(child));
        } else {
          parts.push(buildTypeName(child));
        }
      }
      return parts.join(" | ");
    }

    case "intersection_type": {
      const parts: string[] = [];
      for (const child of node.children) {
        if (child.type === "&") continue;
        parts.push(buildTypeName(child));
      }
      return parts.join(" & ");
    }

    default:
      return node.text.trim();
  }
}

/**
 * Check if a type_annotation (or its inner type) is a union type.
 */
export function isUnionType(typeNode: ArkTSNode): boolean {
  const inner = typeNode.type === "type_annotation"
    ? typeNode.children.find((c) => c.type === "union_type")
    : typeNode.type === "union_type"
      ? typeNode
      : null;
  return inner !== null && inner !== undefined;
}

/**
 * Check if a type includes null or undefined (nullable).
 */
export function isNullable(typeNode: ArkTSNode): boolean {
  // Recursively check all descendants for literal null/undefined
  return hasNullableChild(typeNode);
}

function hasNullableChild(node: ArkTSNode): boolean {
  if (node.type === "literal_type") {
    const t = node.text.trim();
    return t === "null" || t === "undefined";
  }
  for (const child of node.children) {
    if (hasNullableChild(child)) return true;
  }
  return false;
}

/**
 * Get the direct union members from a type node.
 * For union types, returns the non-separator children.
 * For non-union types, returns the type itself as a single-element array.
 */
export function getUnionMembers(typeNode: ArkTSNode): ArkTSNode[] {
  const inner = typeNode.type === "type_annotation"
    ? typeNode.children.find(
        (c) =>
          c.type !== ":" &&
          c.type !== "type" &&
          c.type !== "=",
      )
    : typeNode;

  if (!inner) return [typeNode];

  if (inner.type === "union_type") {
    return inner.children.filter((c) => c.type !== "|");
  }

  return [inner];
}

/**
 * Flatten a union type, resolving nested union_type nodes.
 *
 * For `string | number | boolean`, tree-sitter produces:
 *   union_type { union_type { string, number }, boolean }
 * This function flattens that into [string, number, boolean].
 */
export function flattenUnionType(typeNode: ArkTSNode): ArkTSNode[] {
  const inner = typeNode.type === "type_annotation"
    ? typeNode.children.find(
        (c) =>
          c.type !== ":" &&
          c.type !== "type" &&
          c.type !== "=",
      )
    : typeNode;

  if (!inner) return [];

  function collect(node: ArkTSNode): ArkTSNode[] {
    if (node.type !== "union_type") return [node];
    const result: ArkTSNode[] = [];
    for (const child of node.children) {
      if (child.type === "|") continue;
      if (child.type === "union_type") {
        result.push(...collect(child));
      } else {
        result.push(child);
      }
    }
    return result;
  }

  return collect(inner);
}

/**
 * Find the nearest type_annotation ancestor for a given position.
 */
export function getTypeAtPosition(
  tree: ArkTSTree,
  line: number,
  character: number,
): ArkTSNode | null {
  const node = findNodeAtPosition(tree.rootNode, line, character);
  if (!node) return null;

  // Walk up to find a type_annotation ancestor
  let current: ArkTSNode | null = node;
  while (current) {
    if (current.type === "type_annotation") return current;
    current = current.parent;
  }
  return null;
}
