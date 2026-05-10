import { CodeLens, CodeLensParams, Range } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getBuildMethodComponentTree, getStructDeclarations, parseArkTS } from "./parser.js";
import { getComponentProps } from "./component-props.js";

/**
 * Build CodeLens items for a document.
 * Shows component tree overview above each @Component/@ComponentV2 struct declaration.
 */
export function buildCodeLenses(document: TextDocument, _params: CodeLensParams): CodeLens[] {
  const tree = parseArkTS(document);
  if (!tree) {
    return [];
  }

  const structs = getStructDeclarations(tree);
  const lenses: CodeLens[] = [];

  for (const struct of structs) {
    if (!struct.decorators.includes("Component") && !struct.decorators.includes("ComponentV2")) {
      continue;
    }

    const isV2 = struct.decorators.includes("ComponentV2");
    const componentTree = getBuildMethodComponentTree(tree, struct.name);
    const props = getComponentProps(document, struct.name);

    // Build summary line
    const parts: string[] = [];

    if (props.length > 0) {
      parts.push(`props: ${props.length}`);
    }

    if (componentTree.length > 0) {
      const directChildren = componentTree.filter((n) => n.path.length === 2).length;
      const totalNodes = componentTree.length;
      parts.push(`children: ${directChildren}${totalNodes > directChildren ? ` (${totalNodes} total)` : ""}`);
    }

    const label = parts.length > 0
      ? `${isV2 ? "@ComponentV2" : "@Component"} — ${parts.join(" | ")}`
      : `${isV2 ? "@ComponentV2" : "@Component"}`;

    lenses.push({
      range: Range.create(
        { line: struct.line, character: 0 },
        { line: struct.line, character: 0 },
      ),
      command: {
        title: label,
        command: "",
      },
    });

    // Add a second CodeLens showing the tree structure if it's non-trivial
    if (componentTree.length > 1) {
      const treeLines = buildTreeSummary(componentTree);
      for (const line of treeLines) {
        lenses.push({
          range: Range.create(
            { line: struct.line, character: 0 },
            { line: struct.line, character: 0 },
          ),
          command: {
            title: line,
            command: "",
          },
        });
      }
    }
  }

  return lenses;
}

function buildTreeSummary(
  tree: Array<{ name: string; path: string[]; children: Array<{ name: string }> }>,
): string[] {
  const lines: string[] = [];
  // Build a simple indented tree
  for (const node of tree) {
    const depth = node.path.length - 1;
    const indent = "  ".repeat(depth);
    const childCount = node.children.length > 0 ? ` → {${node.children.map((c) => c.name).join(", ")}}` : "";
    lines.push(`${indent}${node.name}${childCount}`);
  }

  // Merge into a single summary line if short enough, otherwise truncate
  const joined = lines.join("  ");
  if (joined.length <= 80) {
    return [`🌳 ${joined}`];
  }

  // Just show top-level children
  const topLevel = tree.filter((n) => n.path.length === 2);
  return [`🌳 ${topLevel.map((n) => n.name).join(" → ")}`];
}
