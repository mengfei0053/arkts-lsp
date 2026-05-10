import Parser from "tree-sitter";
import ArkTSModule from "tree-sitter-arkts";
import { TextDocument } from "vscode-languageserver-textdocument";

export type ArkTSPoint = {
  line: number;
  character: number;
};

export type ArkTSNode = {
  type: string;
  text: string;
  startPosition: ArkTSPoint;
  endPosition: ArkTSPoint;
  children: ArkTSNode[];
  parent: ArkTSNode | null;
};

export type ArkTSTree = {
  rootNodeType: string;
  rootNode: ArkTSNode;
  document: TextDocument;
};

export type StructDeclarationInfo = {
  name: string;
  decorators: string[];
  exported: boolean;
  line: number;
  node: ArkTSNode;
};

export type MemberInfo = {
  name: string;
  line: number;
  decorator?: string;
  node: ArkTSNode;
};

export type BuilderFunctionInfo = {
  name: string;
  line: number;
  structName?: string;
  node: ArkTSNode;
};

export type BuilderParamFieldInfo = {
  name: string;
  line: number;
  structName?: string;
  node: ArkTSNode;
};

export type ImportInfo = {
  specifier: string;
  names: string[];
  line: number;
  node: ArkTSNode;
};

export type TopLevelDeclarationGroups = {
  functions: Array<{ name: string; exported: boolean; line: number; node: ArkTSNode }>;
  structs: StructDeclarationInfo[];
  variables: Array<{ name: string; exported: boolean; line: number; node: ArkTSNode }>;
  interfaces: Array<{ name: string; exported: boolean; line: number; node: ArkTSNode }>;
  imports: ImportInfo[];
};

export type BuildMethodComponentCall = {
  name: string;
  line: number;
  node: ArkTSNode;
};

export type BuildMethodComponentProp = {
  name: string;
  arguments: string[];
};

export type BuildMethodBuilderBinding = {
  propName: string;
  source: string;
  sourceKind: "Builder" | "BuilderParam" | "Unknown";
  targetName?: string;
};

export type BuildMethodComponentSlot = {
  propName: string;
  source: string;
  sourceKind: "Builder" | "BuilderParam";
  targetName: string;
};

export type BuildMethodComponentTreeNode = {
  name: string;
  path: string[];
  arguments: string[];
  modifiers: string[];
  props: BuildMethodComponentProp[];
  builderBindings: BuildMethodBuilderBinding[];
  slot?: BuildMethodComponentSlot;
  slots?: BuildMethodComponentSlot[];
  range: {
    start: ArkTSPoint;
    end: ArkTSPoint;
  };
  children: BuildMethodComponentTreeNode[];
};

export type WatchDecoratorInfo = {
  callbackName: string;
  fieldName: string;
  structName: string;
  line: number;
  node: ArkTSNode;
};

export type DecoratorCallInfo = {
  name: string;
  arguments: string[];
  fieldName: string;
  structName: string;
  line: number;
};

const parser = new Parser();
parser.setLanguage(ArkTSModule.ArkTS);

export function parseArkTS(document: TextDocument): ArkTSTree | null {
  const source = document.getText();
  if (!source.trim()) {
    return null;
  }

  const tree = parser.parse(source);
  return {
    rootNodeType: tree.rootNode.type,
    rootNode: wrapNode(tree.rootNode, source, null),
    document,
  };
}

export function findNodesByType(tree: ArkTSTree, type: string): ArkTSNode[] {
  const matches: ArkTSNode[] = [];
  walk(tree.rootNode, (node) => {
    if (node.type === type) {
      matches.push(node);
    }
  });
  return matches;
}

export function getDecoratorNames(node: ArkTSNode): string[] {
  const decorators: string[] = [];

  for (const child of node.children) {
    if (child.type === "decorator") {
      const name = getDecoratorName(child);
      if (name) {
        decorators.push(name);
      }
    }
  }

  if (!node.parent) {
    return decorators;
  }

  const siblingDecorators: string[] = [];
  const index = node.parent.children.indexOf(node);
  for (let pointer = index - 1; pointer >= 0; pointer -= 1) {
    const sibling = node.parent.children[pointer];
    if (sibling.type !== "decorator") {
      break;
    }
    const name = getDecoratorName(sibling);
    if (name) {
      siblingDecorators.unshift(name);
    }
  }

  return [...siblingDecorators, ...decorators];
}

export function getStructDeclarations(tree: ArkTSTree): StructDeclarationInfo[] {
  // Normal path: direct struct_declaration nodes
  const directResults = findNodesByType(tree, "struct_declaration").map((node) => ({
    name: findChildText(node, "type_identifier") ?? "",
    decorators: getDecoratorNames(node),
    exported: isExportedNode(node),
    line: node.startPosition.line,
    node,
  }));

  if (directResults.length > 0) {
    return directResults;
  }

  // Recovery path: struct declaration may be buried inside ERROR nodes
  // When tree-sitter-arkts triggers heavy ERROR recovery, struct names may
  // appear as "identifier" nodes rather than "type_identifier"
  const results: StructDeclarationInfo[] = [];

  // Search both type_identifier and identifier nodes
  const candidateNodes = [
    ...findNodesByType(tree, "type_identifier"),
    ...findNodesByType(tree, "identifier"),
  ];

  for (const ident of candidateNodes) {
    // Check if this identifier appears after "struct" keyword in source
    const sourceLine = tree.document.getText().split(/\r?\n/u)[ident.startPosition.line] ?? "";
    const beforeIdent = sourceLine.slice(0, ident.startPosition.character).trimEnd();
    if (!beforeIdent.endsWith("struct")) {
      continue;
    }

    // Avoid duplicate: skip if already found with same name at same line
    if (results.some((r) => r.name === ident.text && r.line === ident.startPosition.line)) {
      continue;
    }

    // Find the enclosing node (might be ERROR)
    let enclosingNode: ArkTSNode | null = ident.parent;
    while (enclosingNode && enclosingNode.type !== "struct_declaration" && enclosingNode !== tree.rootNode) {
      enclosingNode = enclosingNode.parent;
    }

    const name = ident.text;
    const decorators: string[] = [];

    // Collect leading decorators from the enclosing node or its siblings
    if (enclosingNode) {
      for (const child of enclosingNode.children) {
        if (child === ident || child.startPosition.line > ident.startPosition.line) {
          break;
        }
        if (child.type === "decorator") {
          const decoName = child.children.find((c) => c.type === "identifier")?.text;
          if (decoName) {
            decorators.push(decoName);
          }
        }
      }
    }

    results.push({
      name,
      decorators,
      exported: false,
      line: ident.startPosition.line,
      node: enclosingNode ?? ident,
    });
  }

  return results;
}

export function getBuilderFunctions(tree: ArkTSTree): BuilderFunctionInfo[] {
  return findNodesByType(tree, "method_definition")
    .filter((node) => getDecoratorNames(node).includes("Builder"))
    .map((node) => ({
      name: findChildText(node, "property_identifier") ?? "",
      line: node.startPosition.line,
      structName: findAncestorName(node, "struct_declaration", "type_identifier"),
      node,
    }));
}

export function getBuilderParamFields(tree: ArkTSTree): BuilderParamFieldInfo[] {
  return findNodesByType(tree, "public_field_definition")
    .filter((node) => getDecoratorNames(node).includes("BuilderParam"))
    .map((node) => ({
      name: findChildText(node, "property_identifier") ?? "",
      line: node.startPosition.line,
      structName: findAncestorName(node, "struct_declaration", "type_identifier"),
      node,
    }));
}

export function getWatchDecorators(tree: ArkTSTree): WatchDecoratorInfo[] {
  const results: WatchDecoratorInfo[] = [];
  const structs = getStructDeclarations(tree);

  // Helper: find struct name containing a given line
  const findStructNameAtLine = (line: number): string => {
    for (const struct of structs) {
      if (line >= struct.line && line <= struct.node.endPosition.line) {
        return struct.name;
      }
    }
    return "";
  };

  // Pattern 1: decorator inside public_field_definition (normal parse)
  const fields = findNodesByType(tree, "public_field_definition");
  for (const field of fields) {
    const fieldName = findChildText(field, "property_identifier");
    if (!fieldName) {
      continue;
    }

    const structName = findAncestorName(field, "struct_declaration", "type_identifier")
      ?? findAncestorName(field, "class_declaration", "type_identifier")
      ?? findStructNameAtLine(field.startPosition.line);

    for (const child of field.children) {
      if (child.type !== "decorator") {
        continue;
      }
      const watchInfo = extractWatchFromDecorator(child);
      if (watchInfo) {
        results.push({
          ...watchInfo,
          fieldName,
          structName: structName ?? "",
        });
      }
    }
  }

  // Pattern 2: ERROR recovery — decorator + property_identifier are siblings under ERROR
  const errorNodes = findNodesByType(tree, "ERROR");
  for (const errorNode of errorNodes) {
    const decoratorNodes = errorNode.children.filter((c) => c.type === "decorator");
    for (const deco of decoratorNodes) {
      const watchInfo = extractWatchFromDecorator(deco);
      if (!watchInfo) {
        continue;
      }
      // Find the closest property_identifier sibling (field name)
      const decoIndex = errorNode.children.indexOf(deco);
      let fieldName = "";
      for (let i = decoIndex + 1; i < errorNode.children.length; i += 1) {
        const sibling = errorNode.children[i];
        if (sibling.type === "property_identifier") {
          fieldName = sibling.text;
          break;
        }
      }
      // Also check the parent's children (decorator may be before a separate field)
      if (!fieldName && errorNode.parent) {
        const parentIndex = errorNode.parent.children.indexOf(errorNode);
        for (let i = parentIndex + 1; i < errorNode.parent.children.length; i += 1) {
          const sibling = errorNode.parent.children[i];
          if (sibling.type === "property_identifier") {
            fieldName = sibling.text;
            break;
          }
          if (sibling.type === "public_field_definition") {
            fieldName = findChildText(sibling, "property_identifier") ?? "";
            break;
          }
          if (sibling.type === "decorator") {
            break;
          }
        }
      }
      if (!fieldName) {
        continue;
      }

      const structName = findAncestorName(errorNode, "struct_declaration", "type_identifier")
        ?? findAncestorName(errorNode, "class_declaration", "type_identifier")
        ?? findStructNameAtLine(deco.startPosition.line);

      // Avoid duplicates with Pattern 1
      const isDup = results.some(
        (r) => r.callbackName === watchInfo.callbackName && r.fieldName === fieldName,
      );
      if (!isDup) {
        results.push({
          ...watchInfo,
          fieldName,
          structName: structName ?? "",
        });
      }
    }
  }

  return results;
}

function extractWatchFromDecorator(
  deco: ArkTSNode,
  fieldName?: string,
  structName?: string,
): Omit<WatchDecoratorInfo, "fieldName" | "structName"> | null {
  const callExpr = deco.children.find((c) => c.type === "call_expression");
  if (!callExpr) {
    return null;
  }
  const decoratorName = findChildText(callExpr, "identifier");
  if (decoratorName !== "Watch") {
    return null;
  }

  const argsNode = findChildNode(callExpr, "arguments");
  const callbackName = extractFirstStringArgument(argsNode);
  if (!callbackName) {
    return null;
  }

  return {
    callbackName,
    line: deco.startPosition.line,
    node: deco,
  };
}

export function getDecoratorInfo(tree: ArkTSTree): DecoratorCallInfo[] {
  const results: DecoratorCallInfo[] = [];
  const fields = findNodesByType(tree, "public_field_definition");

  for (const field of fields) {
    const fieldName = findChildText(field, "property_identifier");
    if (!fieldName) {
      continue;
    }

    const structName = findAncestorName(field, "struct_declaration", "type_identifier")
      ?? findAncestorName(field, "class_declaration", "type_identifier");

    for (const child of field.children) {
      if (child.type !== "decorator") {
        continue;
      }
      const callExpr = child.children.find((c) => c.type === "call_expression");
      if (!callExpr) {
        continue;
      }

      const decoratorName = findChildText(callExpr, "identifier");
      if (!decoratorName) {
        continue;
      }

      const argsNode = findChildNode(callExpr, "arguments");
      const args = argsNode
        ? argsNode.children
            .filter((c) => c.type === "string")
            .map((c) => c.children.find((sc) => sc.type === "string_fragment")?.text ?? c.text)
        : [];

      results.push({
        name: decoratorName,
        arguments: args,
        fieldName,
        structName: structName ?? "",
        line: child.startPosition.line,
      });
    }
  }

  return results;
}

export function getClassBodyMembers(tree: ArkTSTree, struct: StructDeclarationInfo): { fields: MemberInfo[]; methods: MemberInfo[] } {
  const classBody = struct.node.children.find((child) => child.type === "class_body");
  if (!classBody) {
    return { fields: [], methods: [] };
  }

  return {
    fields: classBody.children
      .filter((child) => child.type === "public_field_definition")
      .map((node) => ({
        name: findChildText(node, "property_identifier") ?? "",
        line: node.startPosition.line,
        decorator: getDecoratorNames(node).at(-1),
        node,
      })),
    methods: classBody.children
      .filter((child) => child.type === "method_definition")
      .map((node) => ({
        name: findChildText(node, "property_identifier") ?? "",
        line: node.startPosition.line,
        decorator: getDecoratorNames(node).at(-1),
        node,
      })),
  };
}

export function getTopLevelDeclarations(tree: ArkTSTree): TopLevelDeclarationGroups {
  const groups: TopLevelDeclarationGroups = {
    functions: [],
    structs: [],
    variables: [],
    interfaces: [],
    imports: [],
  };

  for (const entry of getTopLevelEntries(tree.rootNode)) {
    switch (entry.node.type) {
      case "function_declaration":
        groups.functions.push({
          name: findChildText(entry.node, "identifier") ?? "",
          exported: entry.exported,
          line: entry.node.startPosition.line,
          node: entry.node,
        });
        break;
      case "struct_declaration":
        groups.structs.push({
          name: findChildText(entry.node, "type_identifier") ?? "",
          decorators: getDecoratorNames(entry.node),
          exported: entry.exported,
          line: entry.node.startPosition.line,
          node: entry.node,
        });
        break;
      case "interface_declaration":
        groups.interfaces.push({
          name: findChildText(entry.node, "type_identifier") ?? "",
          exported: entry.exported,
          line: entry.node.startPosition.line,
          node: entry.node,
        });
        break;
      case "lexical_declaration":
        for (const variable of entry.node.children.filter((child) => child.type === "variable_declarator")) {
          groups.variables.push({
            name: findChildText(variable, "identifier") ?? "",
            exported: entry.exported,
            line: variable.startPosition.line,
            node: variable,
          });
        }
        break;
      case "import_statement":
        groups.imports.push({
          specifier: getImportSpecifier(entry.node),
          names: findNodes(entry.node, (node) => node.type === "import_specifier")
            .map((node) => findChildText(node, "identifier") ?? "")
            .filter(Boolean),
          line: entry.node.startPosition.line,
          node: entry.node,
        });
        break;
      default:
        break;
    }
  }

  return groups;
}

export function getBuildMethodComponentCalls(tree: ArkTSTree, structName: string): string[] {
  const buildMethod = findBuildMethodNode(tree, structName);
  if (!buildMethod) {
    return [];
  }

  const seen = new Set<string>();
  const calls: string[] = [];
  for (const node of findNodes(buildMethod, (candidate) => candidate.type === "component_statement" || candidate.type === "call_expression" || candidate.type === "method_definition")) {
    const name = findFirstCallName(node)
      ?? (node.type === "method_definition" ? findChildText(node, "property_identifier") : null);
    if (!name || seen.has(name) || !startsWithUppercase(name)) {
      continue;
    }
    seen.add(name);
    calls.push(name);
  }

  return calls;
}

export function getBuildMethodComponentTree(tree: ArkTSTree, structName: string): BuildMethodComponentTreeNode[] {
  const buildMethod = findBuildMethodNode(tree, structName);
  if (!buildMethod) {
    return [];
  }

  // Pattern 1: normal — build method has a statement_block child
  const statementBlock = buildMethod.children.find((child) => child.type === "statement_block");
  // Pattern 2: error-recovery — buildMethod is an object node (from ERROR recovery)
  const buildBody = statementBlock ?? buildMethod;

  const builderFunctions = getBuilderFunctions(tree).filter((item) => item.structName === structName);
  const builderContext = {
    builderNames: new Set(builderFunctions.map((item) => item.name)),
    builderParamNames: new Set(getBuilderParamFields(tree).filter((item) => item.structName === structName).map((item) => item.name)),
    builderFunctionNodes: new Map(builderFunctions.map((item) => [item.name, item.node])),
  };

  return buildComponentTreeFromNode(buildBody, [], builderContext);
}

function findBuildMethodNode(tree: ArkTSTree, structName: string): ArkTSNode | null {
  const struct = getStructDeclarations(tree).find((item) => item.name === structName);
  if (!struct) {
    return null;
  }

  const classBody = struct.node.children.find((child) => child.type === "class_body");
  if (!classBody) {
    return null;
  }

  // Pattern 1: build() as a direct method_definition child of class_body
  const directMethod = classBody.children.find(
    (child) => child.type === "method_definition" && findChildText(child, "property_identifier") === "build",
  );
  if (directMethod) {
    return directMethod;
  }

  // Pattern 2: error-recovery — build() swallowed into public_field_definition
  // tree-sitter-arkts merges @State field + build() into one public_field_definition;
  // build() appears as call_expression inside an ERROR node, and its body as an object sibling
  for (const field of classBody.children) {
    if (field.type !== "public_field_definition") {
      continue;
    }
    for (const child of field.children) {
      if (child.type === "ERROR") {
        const hasBuildCall = child.children.some(
          (ec) => ec.type === "call_expression" && findChildText(ec, "identifier") === "build",
        );
        if (hasBuildCall) {
          // The object node following ERROR is the build body
          const objectBody = field.children.find((sibling) => sibling.type === "object");
          if (objectBody) {
            return objectBody;
          }
        }
      }
    }
  }

  return null;
}

function buildComponentTreeFromNode(
  node: ArkTSNode,
  ancestorPath: string[] = [],
  builderContext: { builderNames: Set<string>; builderParamNames: Set<string>; builderFunctionNodes: Map<string, ArkTSNode> },
): BuildMethodComponentTreeNode[] {
  const result: BuildMethodComponentTreeNode[] = [];
  for (const child of node.children) {
    if (child.type === "component_statement") {
      const name = findChildText(child, "identifier");
      if (!name || !startsWithUppercase(name)) {
        continue;
      }
      const block = child.children.find((entry) => entry.type === "statement_block");
      const path = [...ancestorPath, name];
      result.push({
        name,
        path,
        arguments: extractArguments(findChildNode(child, "arguments")),
        modifiers: [],
        props: [],
        builderBindings: [],
        range: {
          start: child.startPosition,
          end: child.endPosition,
        },
        children: block ? buildComponentTreeFromNode(block, path, builderContext) : [],
      });
      continue;
    }

    // Error-recovery pattern: UI components appear as method_definition inside object
    // (tree-sitter-arkts ERROR recovery merges build() body into an object literal)
    if (child.type === "method_definition") {
      const name = findChildText(child, "property_identifier");
      if (!name || !startsWithUppercase(name)) {
        continue;
      }
      const block = child.children.find((entry) => entry.type === "statement_block");
      const path = [...ancestorPath, name];
      result.push({
        name,
        path,
        arguments: extractArguments(findChildNode(child, "formal_parameters") ?? findChildNode(child, "arguments")),
        modifiers: [],
        props: [],
        builderBindings: [],
        range: {
          start: child.startPosition,
          end: child.endPosition,
        },
        children: block ? buildComponentTreeFromNode(block, path, builderContext) : [],
      });
      continue;
    }

    if (child.type === "expression_statement") {
      const call = child.children.find((entry) => entry.type === "call_expression");
      const componentDetails = call ? extractComponentCallDetails(call, builderContext) : null;
      if (componentDetails && (startsWithUppercase(componentDetails.name) || componentDetails.builderBindings.some((binding) => binding.propName === "call"))) {
        const path = [...ancestorPath, componentDetails.name];
        result.push({
          name: componentDetails.name,
          path,
          arguments: componentDetails.arguments,
          modifiers: componentDetails.modifiers,
          props: componentDetails.props,
          builderBindings: componentDetails.builderBindings,
          slots: buildHostSlots(componentDetails.builderBindings),
          range: {
            start: call?.startPosition ?? child.startPosition,
            end: call?.endPosition ?? child.endPosition,
          },
          children: buildBuilderLinkedChildren(componentDetails.builderBindings, path, {
            start: call?.startPosition ?? child.startPosition,
            end: call?.endPosition ?? child.endPosition,
          }, builderContext),
        });
      }
      continue;
    }
  }
  return result;
}

function extractComponentCallDetails(
  node: ArkTSNode,
  builderContext: { builderNames: Set<string>; builderParamNames: Set<string>; builderFunctionNodes: Map<string, ArkTSNode> },
): { name: string; arguments: string[]; modifiers: string[]; props: BuildMethodComponentProp[]; builderBindings: BuildMethodBuilderBinding[] } | null {
  const chain = unwrapCallChain(node);
  const rootCall = chain.at(0);
  const rootName = rootCall ? findFirstCallName(rootCall) : null;
  if (!rootCall || !rootName) {
    return null;
  }

  const directBuilderBinding = inferDirectBuilderCallBinding(rootCall, builderContext);
  const props = chain.slice(1).flatMap((call) => {
    const modifierName = findPropertyNameFromCall(call);
    if (!modifierName) {
      return [];
    }
    return [{
      name: modifierName,
      arguments: formatArguments(findChildNode(call, "arguments")),
    } satisfies BuildMethodComponentProp];
  });

  return {
    name: rootName,
    arguments: extractArguments(findChildNode(rootCall, "arguments")),
    modifiers: props.map((prop) => `${prop.name}(${prop.arguments.join(", ")})`),
    props,
    builderBindings: [
      ...props.flatMap((prop) => inferBuilderBinding(prop, builderContext) ? [inferBuilderBinding(prop, builderContext)!] : []),
      ...(directBuilderBinding ? [directBuilderBinding] : []),
    ],
  };
}

function unwrapCallChain(node: ArkTSNode): ArkTSNode[] {
  const chain: ArkTSNode[] = [];
  let current: ArkTSNode | undefined = node;
  while (current?.type === "call_expression") {
    chain.unshift(current);
    current = current.children.find((child) => child.type === "member_expression" || child.type === "call_expression");
    if (current?.type === "member_expression") {
      current = current.children.find((child) => child.type === "call_expression");
    }
  }
  return chain;
}

function extractArguments(node: ArkTSNode | undefined): string[] {
  return formatArguments(node);
}

function formatArguments(node: ArkTSNode | undefined): string[] {
  if (!node) {
    return [];
  }
  return node.children.map((child) => child.text.trim()).filter(Boolean);
}

function findChildNode(node: ArkTSNode, type: string): ArkTSNode | undefined {
  return node.children.find((child) => child.type === type);
}

function findPropertyNameFromCall(node: ArkTSNode): string | null {
  const memberExpression = node.children.find((child) => child.type === "member_expression");
  return memberExpression?.children.find((child) => child.type === "property_identifier")?.text ?? null;
}

function findDirectCallSource(node: ArkTSNode): string | null {
  const memberExpression = node.children.find((child) => child.type === "member_expression");
  if (memberExpression) {
    return memberExpression.text;
  }
  return node.children.find((child) => child.type === "identifier")?.text ?? null;
}

function inferBuilderBinding(
  prop: BuildMethodComponentProp,
  builderContext: { builderNames: Set<string>; builderParamNames: Set<string> },
): BuildMethodBuilderBinding | null {
  const source = prop.arguments[0]?.trim();
  if (!source) {
    return null;
  }

  const targetName = extractBuilderTargetName(source);
  if (!targetName) {
    return null;
  }

  if (builderContext.builderNames.has(targetName)) {
    return {
      propName: prop.name,
      source,
      sourceKind: "Builder",
      targetName,
    };
  }

  if (builderContext.builderParamNames.has(targetName)) {
    return {
      propName: prop.name,
      source,
      sourceKind: "BuilderParam",
      targetName,
    };
  }

  if (/builder$/i.test(prop.name) || /builder$/i.test(targetName)) {
    return {
      propName: prop.name,
      source,
      sourceKind: "Unknown",
      targetName,
    };
  }

  return null;
}

function inferDirectBuilderCallBinding(
  node: ArkTSNode,
  builderContext: { builderNames: Set<string>; builderParamNames: Set<string> },
): BuildMethodBuilderBinding | null {
  const source = findDirectCallSource(node)?.trim();
  if (!source) {
    return null;
  }

  const targetName = extractBuilderTargetName(source);
  if (!targetName) {
    return null;
  }

  if (builderContext.builderNames.has(targetName)) {
    return {
      propName: "call",
      source,
      sourceKind: "Builder",
      targetName,
    };
  }

  if (builderContext.builderParamNames.has(targetName)) {
    return {
      propName: "call",
      source,
      sourceKind: "BuilderParam",
      targetName,
    };
  }

  return null;
}

function buildHostSlots(
  bindings: BuildMethodBuilderBinding[],
): BuildMethodComponentSlot[] | undefined {
  const slots: BuildMethodComponentSlot[] = [];
  for (const binding of bindings) {
    if (binding.propName === "call" || binding.sourceKind === "Unknown" || !binding.targetName) {
      continue;
    }
    slots.push({
      propName: binding.propName,
      source: binding.source,
      sourceKind: binding.sourceKind,
      targetName: binding.targetName,
    });
  }
  return slots.length > 0 ? slots : undefined;
}

function buildBuilderLinkedChildren(
  bindings: BuildMethodBuilderBinding[],
  path: string[],
  ownerRange: { start: ArkTSPoint; end: ArkTSPoint },
  builderContext: { builderNames: Set<string>; builderParamNames: Set<string>; builderFunctionNodes: Map<string, ArkTSNode> },
): BuildMethodComponentTreeNode[] {
  const directBuilderCall = bindings.find((binding) => binding.propName === "call" && binding.sourceKind === "Builder");
  if (directBuilderCall?.targetName) {
    const builderNode = builderContext.builderFunctionNodes.get(directBuilderCall.targetName);
    const block = builderNode?.children.find((child) => child.type === "statement_block");
    return block ? buildComponentTreeFromNode(block, path, builderContext) : [];
  }

  return bindings.flatMap((binding) => {
    if ((binding.sourceKind !== "Builder" && binding.sourceKind !== "BuilderParam") || !binding.targetName) {
      return [];
    }
    const builderNode = binding.sourceKind === "Builder" ? builderContext.builderFunctionNodes.get(binding.targetName) : null;
    const block = builderNode?.children.find((child) => child.type === "statement_block");
    const childPath = [...path, binding.targetName];
    return [{
      name: binding.targetName,
      path: childPath,
      arguments: [],
      modifiers: [],
      props: [],
      builderBindings: [binding],
      slot: {
        propName: binding.propName,
        source: binding.source,
        sourceKind: binding.sourceKind,
        targetName: binding.targetName,
      },
      range: ownerRange,
      children: block ? buildComponentTreeFromNode(block, childPath, builderContext) : [],
    } satisfies BuildMethodComponentTreeNode];
  });
}

function extractBuilderTargetName(source: string): string | null {
  const match = source.match(/(?:this\.)?([A-Za-z_]\w*)$/u);
  return match?.[1] ?? null;
}

function wrapNode(node: Parser.SyntaxNode, source: string, parent: ArkTSNode | null): ArkTSNode {
  const wrapped: ArkTSNode = {
    type: node.type,
    text: source.slice(node.startIndex, node.endIndex),
    startPosition: { line: node.startPosition.row, character: node.startPosition.column },
    endPosition: { line: node.endPosition.row, character: node.endPosition.column },
    children: [],
    parent,
  };

  wrapped.children = Array.from({ length: node.namedChildCount }, (_, index) => wrapNode(node.namedChild(index)!, source, wrapped));
  return wrapped;
}

function walk(node: ArkTSNode, visit: (node: ArkTSNode) => void): void {
  visit(node);
  for (const child of node.children) {
    walk(child, visit);
  }
}

function findNodes(node: ArkTSNode, predicate: (node: ArkTSNode) => boolean): ArkTSNode[] {
  const matches: ArkTSNode[] = [];
  walk(node, (candidate) => {
    if (predicate(candidate)) {
      matches.push(candidate);
    }
  });
  return matches;
}

function getDecoratorName(node: ArkTSNode): string | null {
  const identifier = node.children.find((child) => child.type === "identifier");
  return identifier?.text ?? null;
}

function findChildText(node: ArkTSNode, childType: string): string | null {
  return node.children.find((child) => child.type === childType)?.text ?? null;
}

function findAncestorName(node: ArkTSNode, ancestorType: string, nameChildType: string): string | undefined {
  let current = node.parent;
  while (current) {
    if (current.type === ancestorType) {
      return findChildText(current, nameChildType) ?? undefined;
    }
    current = current.parent;
  }
  return undefined;
}

function findFirstCallName(node: ArkTSNode): string | null {
  if (node.type === "component_statement") {
    return findChildText(node, "identifier");
  }
  if (node.type === "call_expression") {
    return findChildText(node, "identifier")
      ?? node.children
        .find((child) => child.type === "member_expression")
        ?.children.find((child) => child.type === "property_identifier")
        ?.text
      ?? null;
  }
  return null;
}

function startsWithUppercase(value: string): boolean {
  return /^[A-Z]/u.test(value);
}

function isExportedNode(node: ArkTSNode): boolean {
  return node.parent?.type === "export_statement";
}

function getImportSpecifier(node: ArkTSNode): string {
  const stringNode = node.children.find((child) => child.type === "string");
  const fragment = stringNode?.children.find((child) => child.type === "string_fragment")?.text;
  return fragment ?? stringNode?.text.replace(/^['"]|['"]$/gu, "") ?? "";
}

function getTopLevelEntries(root: ArkTSNode): Array<{ node: ArkTSNode; exported: boolean }> {
  const entries: Array<{ node: ArkTSNode; exported: boolean }> = [];

  for (const child of root.children) {
    if (child.type === "export_statement") {
      for (const nested of child.children) {
        if (nested.type === "decorator") {
          continue;
        }
        entries.push({ node: nested, exported: true });
      }
      continue;
    }
    entries.push({ node: child, exported: false });
  }

  return entries;
}

function extractFirstStringArgument(argsNode: ArkTSNode | undefined): string | null {
  if (!argsNode) {
    return null;
  }
  const stringNode = argsNode.children.find((child) => child.type === "string");
  if (!stringNode) {
    return null;
  }
  const fragment = stringNode.children.find((child) => child.type === "string_fragment");
  return fragment?.text ?? null;
}
