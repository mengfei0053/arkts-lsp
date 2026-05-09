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
