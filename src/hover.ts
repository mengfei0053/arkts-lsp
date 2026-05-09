import { Hover, Position } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { resolveLinkedReferenceTarget } from "./navigation.js";
import { ArkTSNode, findNodesByType, getDecoratorNames, parseArkTS } from "./parser.js";
import { escapeMarkdown, getImportBindingAtPosition, getWordAtPosition } from "./text.js";
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
  if (member.decorator === "Provide") {
    details.push("", "This field acts as a **provider** for descendant components.");
  }
  if (member.decorator === "Consume") {
    details.push("", "This field acts as a **consumer** of a provided value.");
  }
  if (member.decorator === "ObjectLink") {
    const observedHint = findObservedClassHint(document, member.declarationText);
    details.push("", observedHint ?? "This field links to an **Observed** object for reactive updates.");
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
