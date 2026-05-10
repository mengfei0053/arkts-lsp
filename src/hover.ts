import { Hover, Position } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { resolveLinkedReferenceTarget } from "./navigation.js";
import { ArkTSNode, findNodesByType, getBuildMethodComponentTree, getDecoratorNames, getDecoratorInfo, getMonitorDecorators, getProviderConsumerPairs, getComputedMethods, getStructDeclarations, getWatchDecorators, parseArkTS } from "./parser.js";
import { escapeMarkdown, getEnclosingTypeContextAtPosition, getImportBindingAtPosition, getWordAtPosition } from "./text.js";
import { collectDocumentSymbols, displayDocumentName, findDocumentMemberSymbolAtPosition, symbolKindLabel, typeMemberLabel } from "./symbols.js";
import { lookupImportedComponent, resolveImportedComponents } from "./component-resolver.js";

export function buildHover(document: TextDocument, position: Position): Hover | null {
  // Check decorator-specific hovers first (precise position matching on decorator nodes)
  const monitorHover = buildMonitorDecoratorHover(document, position);
  if (monitorHover) {
    return monitorHover;
  }

  const providerConsumerHover = buildProviderConsumerDecoratorHover(document, position);
  if (providerConsumerHover) {
    return providerConsumerHover;
  }

  const computedHover = buildComputedDecoratorHover(document, position);
  if (computedHover) {
    return computedHover;
  }

  const watchHover = buildWatchDecoratorHover(document, position);
  if (watchHover) {
    return watchHover;
  }

  // Check decorated field hover (public_field_definition with decorators)
  const decoratedFieldHover = buildDecoratedFieldHover(document, position);
  if (decoratedFieldHover) {
    return decoratedFieldHover;
  }

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

  // Check if the word at position is an imported component
  const word = getWordAtPosition(document, position);
  if (word) {
    const importedComponents = resolveImportedComponents(document, documents);
    const imported = lookupImportedComponent(word, importedComponents);
    if (imported) {
      const targetDoc = documents.find((d) => d.uri === imported.targetUri);
      if (targetDoc) {
        const targetSymbol = collectDocumentSymbols(targetDoc).find((s) => s.name === imported.structName);
        const declarationText = targetSymbol
          ? readLine(targetDoc, targetSymbol.location.range.start.line).trim()
          : null;
        const decorators = getDecoratorsForNamedTopLevelDeclaration(targetDoc, imported.structName);
        const lines: string[] = [
          `### ${imported.isV2 ? "@ComponentV2" : "@Component"} \`${word}\``,
          "",
        ];
        if (imported.localName !== imported.importedName) {
          lines.push(`Alias of \`${imported.importedName}\` from \`${imported.structName}\``, "");
        }
        lines.push(
          `Defined in \`${displayDocumentName(targetDoc.uri)}\``,
          "",
        );
        if (declarationText) {
          lines.push(`Declaration: \`${escapeMarkdown(declarationText)}\``);
        }
        lines.push(...formatDecoratorDetails(decorators));
        return {
          contents: { kind: "markdown", value: lines.join("\n") },
        };
      }
    }
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
    // V2 decorators
    case "Local":
      details.push("", "V2 **local state** — reactive state internal to `@ComponentV2`. UI re-renders on change.");
      break;
    case "Param":
      details.push("", "V2 **one-way param** — receives value from parent `@ComponentV2` via `@Param`.");
      break;
    case "Event":
      details.push("", "V2 **event callback** — emits events from child to parent `@ComponentV2`.");
      break;
    case "Provider":
      details.push("", "V2 **provider** — provides data cross-level to descendant `@Consumer` by key alias.");
      break;
    case "Consumer":
      details.push("", "V2 **consumer** — consumes data from ancestor `@Provider` by key alias.");
      break;
    case "Computed":
      details.push("", "V2 **computed** — derived getter that auto-updates when dependencies change.");
      break;
    case "Trace":
      details.push("", "V2 **trace** — marks field for **fine-grained** reactivity in `@ObservedV2` class.");
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

  for (const type of ["function_declaration", "struct_declaration", "method_definition", "public_field_definition"] as const) {
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
    const label = type === "function_declaration" ? "Function" : type === "struct_declaration" ? "Class" : type === "public_field_definition" ? "Field" : typeMemberLabel({
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
  if (decorators.length === 0) {
    return [];
  }

  const lines: string[] = ["", `Decorators: ${decorators.map((decorator) => `\`@${decorator}\``).join(", ")}`];

  // Append semantic description for known decorators
  const descriptions: Record<string, string> = {
    // V1
    State: "Reactive state — UI re-renders when this value changes.",
    Prop: "One-way data binding — receives value from parent component.",
    Link: "Two-way data binding — syncs value with parent `@State`.",
    Provide: "This field acts as a **provider** for descendant components.",
    Consume: "This field acts as a **consumer** of a provided value.",
    ObjectLink: "This field links to an **Observed** object for reactive updates.",
    Watch: "Observes changes on the decorated field and invokes the named callback.",
    Track: "Marks this field for **fine-grained** reactivity.",
    Observed: "Marks this class as observable for reactive object tracking.",
    Builder: "Declares a builder function for declarative UI rendering.",
    BuilderParam: "Declares a slot for receiving builder content from parent.",
    // V2
    ComponentV2: "V2 component — uses state management V2 (`@Local`, `@Param`, etc.).",
    Local: "V2 **local state** — reactive state internal to `@ComponentV2`.",
    Param: "V2 **one-way param** — receives value from parent `@ComponentV2`.",
    Event: "V2 **event callback** — emits events from child to parent `@ComponentV2`.",
    Monitor: "V2 — Observes specified fields and invokes callback on change.",
    Provider: "V2 **provider** — provides data cross-level to descendant `@Consumer` by key alias.",
    Consumer: "V2 **consumer** — consumes data from ancestor `@Provider` by key alias.",
    Computed: "V2 **computed** — derived getter that auto-updates when dependencies change.",
    ObservedV2: "V2 observable class — enables fine-grained reactivity with `@Trace`.",
    Trace: "V2 **trace** — marks field for **fine-grained** reactivity in `@ObservedV2` class.",
  };

  for (const decorator of decorators) {
    const desc = descriptions[decorator];
    if (desc) {
      lines.push("", `\`@${decorator}\`: ${desc}`);
    }
  }

  return lines;
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

function buildMonitorDecoratorHover(document: TextDocument, position: Position): Hover | null {
  const tree = parseArkTS(document);
  if (!tree) {
    return null;
  }

  const monitors = getMonitorDecorators(tree);
  for (const monitor of monitors) {
    const node = monitor.node;
    if (
      position.line >= node.startPosition.line &&
      position.line <= node.endPosition.line &&
      (position.line !== node.startPosition.line || position.character >= node.startPosition.character) &&
      (position.line !== node.endPosition.line || position.character <= node.endPosition.character)
    ) {
      const fields = monitor.observedFields.map((f) => `\`${f}\``).join(", ");
      const lines = [
        `### Decorator \`@Monitor\``,
        "",
        `V2 — Observes ${fields} and invokes \`${monitor.callbackName}()\` on change.`,
        "",
        `In \`${monitor.structName}\``,
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

function buildProviderConsumerDecoratorHover(document: TextDocument, position: Position): Hover | null {
  const tree = parseArkTS(document);
  if (!tree) {
    return null;
  }

  const pairs = getProviderConsumerPairs(tree);
  for (const pair of pairs) {
    const node = pair.node;
    if (
      position.line >= node.startPosition.line &&
      position.line <= node.endPosition.line &&
      (position.line !== node.startPosition.line || position.character >= node.startPosition.character) &&
      (position.line !== node.endPosition.line || position.character <= node.endPosition.character)
    ) {
      const kindLabel = pair.kind === "Provider" ? "provides data" : "consumes data";
      const targetLabel = pair.kind === "Provider" ? "descendant `@Consumer`" : "ancestor `@Provider`";
      const lines = [
        `### Decorator \`@${pair.kind}\``,
        "",
        `V2 — ${kindLabel} via key \`${pair.key}\` to ${targetLabel}.`,
        "",
        `Field: \`${pair.fieldName}\` in \`${pair.structName}\``,
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

function buildComputedDecoratorHover(document: TextDocument, position: Position): Hover | null {
  const tree = parseArkTS(document);
  if (!tree) {
    return null;
  }

  const computed = getComputedMethods(tree);
  for (const comp of computed) {
    // @Computed is a leading decorator sibling, check if position is near the method line
    const methodNode = comp.node;
    // Check if position is on the method or its leading decorator
    const parent = methodNode.parent;
    if (!parent) {
      continue;
    }

    const methodIndex = parent.children.indexOf(methodNode);
    const relevantNodes: ArkTSNode[] = [];
    for (let i = methodIndex - 1; i >= 0; i -= 1) {
      const sibling = parent.children[i];
      if (sibling.type === "decorator") {
        relevantNodes.unshift(sibling);
      } else {
        break;
      }
    }
    relevantNodes.push(methodNode);

    const isInRange = relevantNodes.some(
      (n) =>
        position.line >= n.startPosition.line &&
        position.line <= n.endPosition.line &&
        (position.line !== n.startPosition.line || position.character >= n.startPosition.character) &&
        (position.line !== n.endPosition.line || position.character <= n.endPosition.character),
    );

    if (isInRange) {
      const getterTag = comp.isGetter ? " (getter)" : "";
      const lines = [
        `### Decorator \`@Computed\``,
        "",
        `V2 — Derived value${getterTag}: \`${comp.name}\`. Auto-updates when dependencies change.`,
        "",
        `In \`${comp.structName}\``,
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

/**
 * Generic hover for decorated field definitions (public_field_definition with decorators).
 * Handles V2 field decorators like @Local, @Param, @Event, @Trace etc.
 * that are not covered by specialized hover functions.
 */
function buildDecoratedFieldHover(document: TextDocument, position: Position): Hover | null {
  const tree = parseArkTS(document);
  if (!tree) {
    return null;
  }

  // Find a public_field_definition whose decorator range covers the position
  const fields = findNodesByType(tree, "public_field_definition");
  for (const field of fields) {
    // Collect all decorator nodes within this field
    const decorators: ArkTSNode[] = [];
    for (const child of field.children) {
      if (child.type === "decorator") {
        decorators.push(child);
      }
    }

    // Check if position is within any decorator
    const matchingDeco = decorators.find(
      (d) =>
        position.line >= d.startPosition.line &&
        position.line <= d.endPosition.line &&
        (position.line !== d.startPosition.line || position.character >= d.startPosition.character) &&
        (position.line !== d.endPosition.line || position.character <= d.endPosition.character),
    );

    if (!matchingDeco) {
      continue;
    }

    // Get decorator info for this field
    const fieldInfo = getDecoratorInfo(tree).find(
      (info) => info.line === matchingDeco.startPosition.line,
    );

    const fieldName = findNamedChild(field, "property_identifier")?.text ?? "field";
    const decoNames = decorators.map((d) => {
      const id = d.children.find((c) => c.type === "identifier");
      const callExpr = d.children.find((c) => c.type === "call_expression");
      return id?.text ?? (callExpr ? findNamedChild(callExpr, "identifier")?.text : null) ?? "?";
    });

    const lines = [
      `### Field \`${fieldName}\``,
      "",
      `Decorators: ${decoNames.map((n) => `\`@${n}\``).join(", ")}`,
    ];

    // Add semantic descriptions
    if (fieldInfo) {
      lines.push(...formatDecoratorDetails([fieldInfo.name]));
    } else {
      lines.push(...formatDecoratorDetails(decoNames));
    }

    if (fieldInfo?.structName) {
      lines.push("", `In \`${fieldInfo.structName}\``);
    }

    return {
      contents: {
        kind: "markdown",
        value: lines.join("\n"),
      },
    };
  }

  return null;
}
