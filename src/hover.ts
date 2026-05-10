import { Hover, Position } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { resolveLinkedReferenceTarget } from "./navigation.js";
import { ArkTSNode, findNodesByType, getBuildMethodComponentTree, getDecoratorNames, getStructDeclarations, getWatchDecorators, parseArkTS } from "./parser.js";
import { escapeMarkdown, getEnclosingTypeContextAtPosition, getImportBindingAtPosition, getWordAtPosition } from "./text.js";
import { collectDocumentSymbols, displayDocumentName, findDocumentMemberSymbolAtPosition, symbolKindLabel, typeMemberLabel } from "./symbols.js";

export function buildHover(document: TextDocument, position: Position): Hover | null {
  const member = findDocumentMemberSymbolAtPosition(document, position);
  if (member) {
    const decoratorDetails = buildMemberDecoratorDetails(document, member);
    return {
      contents: {
        kind: "markdown",
        value: [
          `### ${typeMemberLabel(member)} \`${member.name}\``,
          "",
          `Member of \`${member.containerName}\``,
          "",
          `Defined in \`${displayDocumentName(document.uri)}\``,
          "",
          `Declaration: \`${escapeMarkdown(member.declarationText)}\``,
          ...decoratorDetails,
        ].join("\n"),
      },
    };
  }

  const componentTreeHover = buildComponentTreeHover(document, position);
  if (componentTreeHover) {
    return componentTreeHover;
  }

  const watchHover = buildWatchDecoratorHover(document, position);
  if (watchHover) {
    return watchHover;
  }

  const decoratedDeclarationHover = buildDecoratedDeclarationHover(document, position);
  if (decoratedDeclarationHover) {
    return decoratedDeclarationHover;
  }

  const symbol = collectDocumentSymbols(document).find((candidate) => candidate.name === getWordAtPosition(document, position));
  if (symbol) {
    const lineText = readLine(document, symbol.location.range.start.line).trim();
    return {
      contents: {
        kind: "markdown",
        value: [
          `### ${symbolKindLabel(symbol.kind)} \`${symbol.name}\``,
          "",
          `Defined in \`${displayDocumentName(document.uri)}\``,
          "",
          `Declaration: \`${escapeMarkdown(lineText)}\``,
        ].join("\n"),
      },
    };
  }

  const lineText = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  }).trim();
  if (!lineText) {
    return null;
  }

  return {
    contents: {
      kind: "markdown",
      value: ["### ArkTS LSP", "", "MVP hover information for the current line.", "", `Line content: \`${escapeMarkdown(lineText)}\``].join("\n"),
    },
  };
}

export function buildLinkedHover(
  documents: TextDocument[],
  document: TextDocument,
  position: Position,
  resolveImportTarget: (documentUri: string, specifier: string) => TextDocument | null,
): Hover | null {
  const importBinding = getImportBindingAtPosition(document, position);
  if (importBinding) {
    const targetDocument = resolveImportTarget(document.uri, importBinding.specifier);
    const exportedSymbol = targetDocument
      ? collectDocumentSymbols(targetDocument).find((symbol) => symbol.name === importBinding.importedName)
      : null;
    if (exportedSymbol && targetDocument) {
      const declarationText = readLine(targetDocument, exportedSymbol.location.range.start.line).trim();
      const decorators = getDecoratorsForNamedTopLevelDeclaration(targetDocument, importBinding.importedName);
      return {
        contents: {
          kind: "markdown",
          value: [
            `### ${symbolKindLabel(exportedSymbol.kind)} \`${importBinding.localName}\``,
            "",
            importBinding.localName === importBinding.importedName
              ? `Imported from \`${importBinding.specifier}\``
              : `Alias of \`${importBinding.importedName}\` from \`${importBinding.specifier}\``,
            "",
            `Defined in \`${displayDocumentName(targetDocument.uri)}\``,
            "",
            `Declaration: \`${escapeMarkdown(declarationText)}\``,
            ...formatDecoratorDetails(decorators),
          ].join("\n"),
        },
      };
    }
  }

  const linkedTarget = resolveLinkedReferenceTarget(documents, document, position, resolveImportTarget);
  const exportedSymbol = linkedTarget
    ? collectDocumentSymbols(linkedTarget.exportedDocument).find((symbol) => symbol.name === linkedTarget.exportedName)
    : null;
  if (linkedTarget && exportedSymbol) {
    const declarationText = readLine(linkedTarget.exportedDocument, exportedSymbol.location.range.start.line).trim();
    const decorators = getDecoratorsForNamedTopLevelDeclaration(linkedTarget.exportedDocument, linkedTarget.exportedName);
    return {
      contents: {
        kind: "markdown",
        value: [
          `### ${symbolKindLabel(exportedSymbol.kind)} \`${linkedTarget.exportedName}\``,
          "",
          `Defined in \`${displayDocumentName(linkedTarget.exportedDocument.uri)}\``,
          "",
          `Declaration: \`${escapeMarkdown(declarationText)}\``,
          ...formatDecoratorDetails(decorators),
        ].join("\n"),
      },
    };
  }

  return buildHover(document, position);
}

function readLine(document: TextDocument, line: number): string {
  return document.getText({
    start: { line, character: 0 },
    end: { line: line + 1, character: 0 },
  });
}

function buildMemberDecoratorDetails(
  document: TextDocument,
  member: { decorator?: string; declarationText: string },
): string[] {
  if (!member.decorator) {
    return [];
  }

  const details = ["", `Decorator: \`@${member.decorator}\``];

  switch (member.decorator) {
    case "State":
      details.push("", "Reactive state — UI re-renders when this value changes.");
      break;
    case "Prop":
      details.push("", "One-way data binding — receives value from parent component.");
      break;
    case "Link":
      details.push("", "Two-way data binding — syncs value with parent `@State`.");
      break;
    case "Provide":
      details.push("", "This field acts as a **provider** for descendant components.");
      break;
    case "Consume":
      details.push("", "This field acts as a **consumer** of a provided value.");
      break;
    case "ObjectLink": {
      const observedHint = findObservedClassHint(document, member.declarationText);
      details.push("", observedHint ?? "This field links to an **Observed** object for reactive updates.");
      break;
    }
    case "Watch":
      details.push("", "Observes changes on the decorated field and invokes the named callback.");
      break;
    case "Track":
      details.push("", "Marks this field for **fine-grained** reactivity — only re-renders when this specific property changes.");
      break;
    default:
      break;
  }

  return details;
}

function buildDecoratedDeclarationHover(document: TextDocument, position: Position): Hover | null {
  const tree = parseArkTS(document);
  if (!tree) {
    return null;
  }

  for (const type of ["function_declaration", "struct_declaration", "method_definition"] as const) {
    const match = findNodesByType(tree, type).find((node) => isPositionWithinDecoratedDeclaration(node, position));
    if (!match) {
      continue;
    }

    const decorators = getDecoratorNames(match);
    if (decorators.length === 0) {
      continue;
    }

    const name =
      findNamedChild(match, "identifier")?.text ??
      findNamedChild(match, "type_identifier")?.text ??
      findNamedChild(match, "property_identifier")?.text ??
      "symbol";
    const label = type === "function_declaration" ? "Function" : type === "struct_declaration" ? "Class" : typeMemberLabel({
      name,
      kind: "method",
      location: { uri: document.uri, range: { start: position, end: position } },
      containerName: "",
      declarationText: match.text,
      scopeRange: { start: position, end: position },
      decorator: decorators.at(-1),
    });

    return {
      contents: {
        kind: "markdown",
        value: [
          `### ${label} \`${name}\``,
          "",
          `Defined in \`${displayDocumentName(document.uri)}\``,
          "",
          `Declaration: \`${escapeMarkdown(singleLine(match.text))}\``,
          ...formatDecoratorDetails(decorators),
        ].join("\n"),
      },
    };
  }

  return null;
}

function isPositionWithinDecoratedDeclaration(node: ArkTSNode, position: Position): boolean {
  const relatedNodes = [...findLeadingDecoratorSiblings(node), node];
  return relatedNodes.some((candidate) =>
    isWithinRange(position, candidate.startPosition, candidate.endPosition),
  );
}

function findLeadingDecoratorSiblings(node: ArkTSNode): ArkTSNode[] {
  if (!node.parent) {
    return [];
  }

  const result: ArkTSNode[] = [];
  const index = node.parent.children.indexOf(node);
  for (let pointer = index - 1; pointer >= 0; pointer -= 1) {
    const sibling = node.parent.children[pointer];
    if (sibling.type !== "decorator") {
      break;
    }
    result.unshift(sibling);
  }
  return result;
}

function getDecoratorsForNamedTopLevelDeclaration(document: TextDocument, name: string): string[] {
  const tree = parseArkTS(document);
  if (!tree) {
    return [];
  }

  for (const type of ["function_declaration", "struct_declaration", "interface_declaration", "class_declaration"] as const) {
    const match = findNodesByType(tree, type).find((node) =>
      ["identifier", "type_identifier", "property_identifier"].some((childType) => findNamedChild(node, childType)?.text === name),
    );
    if (match) {
      return getDecoratorNames(match);
    }
  }

  return [];
}

function findObservedClassHint(document: TextDocument, declarationText: string): string | null {
  const match = declarationText.match(/:\s*([A-Za-z_]\w*)/u);
  const typeName = match?.[1];
  if (!typeName) {
    return null;
  }

  const decorators = getDecoratorsForNamedTopLevelDeclaration(document, typeName);
  return decorators.includes("Observed")
    ? `This field links to an **Observed** object: \`${typeName}\`, enabling **reactive** updates.`
    : null;
}

function formatDecoratorDetails(decorators: string[]): string[] {
  return decorators.length > 0 ? ["", `Decorators: ${decorators.map((decorator) => `\`@${decorator}\``).join(", ")}`] : [];
}

function findNamedChild(node: ArkTSNode, type: string): ArkTSNode | undefined {
  return node.children.find((child) => child.type === type);
}

function isWithinRange(position: Position, start: { line: number; character: number }, end: { line: number; character: number }): boolean {
  if (position.line < start.line || position.line > end.line) {
    return false;
  }
  if (position.line === start.line && position.character < start.character) {
    return false;
  }
  if (position.line === end.line && position.character > end.character) {
    return false;
  }
  return true;
}

function singleLine(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function buildComponentTreeHover(document: TextDocument, position: Position): Hover | null {
  const tree = parseArkTS(document);
  if (!tree) {
    return null;
  }

  const enclosingType = getEnclosingTypeContextAtPosition(document, position);
  if (!enclosingType) {
    return null;
  }

  const componentTree = getBuildMethodComponentTree(tree, enclosingType.name);
  if (componentTree.length === 0) {
    return null;
  }

  // Find the tree node at the hover position
  const node = findTreeNodeAtPosition(componentTree, position);
  if (!node) {
    return null;
  }

  const lines: string[] = [
    `### UI Component \`${node.name}\``,
    "",
    `In \`${enclosingType.name}.build()\``,
  ];

  if (node.path.length > 1) {
    lines.push("", `Path: \`${node.path.join(" → ")}\``);
  }

  if (node.children.length > 0) {
    lines.push("", `Children: ${node.children.map((child) => `\`${child.name}\``).join(", ")}`);
  }

  if (node.slots && node.slots.length > 0) {
    for (const slot of node.slots) {
      lines.push("", `Slot \`${slot.propName}\`: \`${slot.source}\` → \`${slot.targetName}\` (${slot.sourceKind})`);
    }
  }

  if (node.builderBindings && node.builderBindings.length > 0) {
    for (const binding of node.builderBindings) {
      if (binding.propName !== "call") {
        lines.push("", `Prop \`${binding.propName}\`: \`${binding.source}\` (${binding.sourceKind})`);
      }
    }
  }

  return {
    contents: {
      kind: "markdown",
      value: lines.join("\n"),
    },
  };
}

function findTreeNodeAtPosition(
  nodes: Array<{
    name: string;
    path: string[];
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    children: any[];
    slots?: any[];
    builderBindings?: any[];
  }>,
  position: Position,
): typeof nodes[number] | null {
  for (const node of nodes) {
    if (
      position.line >= node.range.start.line &&
      position.line <= node.range.end.line &&
      (position.line !== node.range.start.line || position.character >= node.range.start.character) &&
      (position.line !== node.range.end.line || position.character <= node.range.end.character)
    ) {
      // Check children first (innermost match)
      const childMatch = findTreeNodeAtPosition(node.children, position);
      return childMatch ?? node;
    }
  }
  return null;
}

function buildWatchDecoratorHover(document: TextDocument, position: Position): Hover | null {
  const tree = parseArkTS(document);
  if (!tree) {
    return null;
  }

  // Check if position is within any @Watch decorator node
  const watches = getWatchDecorators(tree);
  for (const watch of watches) {
    const node = watch.node;
    if (
      position.line >= node.startPosition.line &&
      position.line <= node.endPosition.line &&
      (position.line !== node.startPosition.line || position.character >= node.startPosition.character) &&
      (position.line !== node.endPosition.line || position.character <= node.endPosition.character)
    ) {
      const lines = [
        `### Decorator \`@Watch\``,
        "",
        `Observes **\`${watch.fieldName}\`** and invokes \`${watch.callbackName}()\` on change.`,
        "",
        `In \`${watch.structName}\``,
      ];

      return {
        contents: {
          kind: "markdown",
          value: lines.join("\n"),
        },
      };
    }
  }

  return null;
}
