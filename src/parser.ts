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

export type BuildMethodComponentTreeNode = {
  name: string;
  path: string[];
  arguments: string[];
  modifiers: string[];
  props: BuildMethodComponentProp[];
  builderBindings: BuildMethodBuilderBinding[];
  range: {
    start: ArkTSPoint;
    end: ArkTSPoint;
  };
  children: BuildMethodComponentTreeNode[];
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
  return findNodesByType(tree, "struct_declaration").map((node) => ({
    name: findChildText(node, "type_identifier") ?? "",
    decorators: getDecoratorNames(node),
    exported: isExportedNode(node),
    line: node.startPosition.line,
    node,
  }));
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
  for (const node of findNodes(buildMethod, (candidate) => candidate.type === "component_statement" || candidate.type === "call_expression")) {
    const name = findFirstCallName(node);
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

  const statementBlock = buildMethod.children.find((child) => child.type === "statement_block");
  if (!statementBlock) {
    return [];
  }

  const builderContext = {
    builderNames: new Set(getBuilderFunctions(tree).filter((item) => item.structName === structName).map((item) => item.name)),
    builderParamNames: new Set(getBuilderParamFields(tree).filter((item) => item.structName === structName).map((item) => item.name)),
  };

  return buildComponentTreeFromNode(statementBlock, [], builderContext);
}

function findBuildMethodNode(tree: ArkTSTree, structName: string): ArkTSNode | null {
  const struct = getStructDeclarations(tree).find((item) => item.name === structName);
  if (!struct) {
    return null;
  }

  const classBody = struct.node.children.find((child) => child.type === "class_body");
  return classBody?.children.find(
    (child) => child.type === "method_definition" && findChildText(child, "property_identifier") === "build",
  ) ?? null;
}

function buildComponentTreeFromNode(
  node: ArkTSNode,
  ancestorPath: string[] = [],
  builderContext: { builderNames: Set<string>; builderParamNames: Set<string> },
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

    if (child.type === "expression_statement") {
      const call = child.children.find((entry) => entry.type === "call_expression");
      const componentDetails = call ? extractComponentCallDetails(call, builderContext) : null;
      if (componentDetails && startsWithUppercase(componentDetails.name)) {
        result.push({
          name: componentDetails.name,
          path: [...ancestorPath, componentDetails.name],
          arguments: componentDetails.arguments,
          modifiers: componentDetails.modifiers,
          props: componentDetails.props,
          builderBindings: componentDetails.builderBindings,
          range: {
            start: call?.startPosition ?? child.startPosition,
            end: call?.endPosition ?? child.endPosition,
          },
          children: [],
        });
      }
      continue;
    }
  }
  return result;
}

function extractComponentCallDetails(
  node: ArkTSNode,
  builderContext: { builderNames: Set<string>; builderParamNames: Set<string> },
): { name: string; arguments: string[]; modifiers: string[]; props: BuildMethodComponentProp[]; builderBindings: BuildMethodBuilderBinding[] } | null {
  const chain = unwrapCallChain(node);
  const rootCall = chain.at(0);
  const rootName = rootCall ? findFirstCallName(rootCall) : null;
  if (!rootCall || !rootName) {
    return null;
  }

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
    builderBindings: props.flatMap((prop) => inferBuilderBinding(prop, builderContext) ? [inferBuilderBinding(prop, builderContext)!] : []),
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
    return findChildText(node, "identifier");
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
