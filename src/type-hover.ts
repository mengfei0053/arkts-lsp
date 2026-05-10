import { Hover, Position } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { parseArkTS } from "./parser.js";
import {
  getTypeAtPosition,
  parseTypeName,
  isNullable,
  isUnionType,
} from "./type-model.js";

/**
 * Build hover info for type annotations.
 *
 * When hovering over a variable that has a type annotation,
 * show the parsed type name with additional semantic tags
 * (nullable indicator, union indicator, etc.).
 */
export function buildTypeHover(
  document: TextDocument,
  position: Position,
): Hover | null {
  const tree = parseArkTS(document);
  if (!tree) return null;

  const typeNode = getTypeAtPosition(tree, position.line, position.character);
  if (!typeNode) return null;

  const typeName = parseTypeName(typeNode);
  if (!typeName) return null;

  const nullable = isNullable(typeNode);
  const union = isUnionType(typeNode);

  // Find the variable name for context
  let varName = "variable";
  const parent = typeNode.parent;
  if (parent) {
    const idNode = parent.children.find(
      (c) => c.type === "identifier" || c.type === "property_identifier",
    );
    if (idNode) {
      varName = idNode.text;
    }
  }

  const lines: string[] = [
    `### \`${varName}\`: \`${typeName}\``,
    "",
    "**Type information**:",
    `- Type: \`${typeName}\``,
  ];

  if (union) {
    lines.push(`- Union type: \`${typeName}\``);
  }

  if (nullable) {
    lines.push("- ⚠️ **Nullable** — may be `null` or `undefined`");
  }

  return {
    contents: {
      kind: "markdown",
      value: lines.join("\n"),
    },
  };
}
