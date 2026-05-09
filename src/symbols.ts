import {
  CompletionItemKind,
  Location,
  Position,
  SymbolInformation,
  SymbolKind,
  WorkspaceSymbol,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ArkTSNode, findNodesByType, getDecoratorNames, getTopLevelDeclarations, parseArkTS } from "./parser.js";
import { getEnclosingTypeContextAtPosition, getWordAtPosition, isPositionWithinRange, matchArktsTypeDeclaration } from "./text.js";

export function collectDocumentSymbols(document: TextDocument): SymbolInformation[] {
  const parserDeclarations = extractTopLevelDeclarationsFromParser(document);
  if (parserDeclarations.length > 0) {
    return parserDeclarations.map((declaration) =>
      createSymbol(
        document,
        declaration.lineIndex,
        declaration.line,
        declaration.name,
        declaration.kind,
        declaration.containerName,
      ),
    );
  }

  return extractTopLevelDeclarations(document).map((declaration) =>
    createSymbol(
      document,
      declaration.lineIndex,
      declaration.line,
      declaration.name,
      declaration.kind,
      declaration.containerName,
    ),
  );
}

export function collectWorkspaceSymbols(documents: TextDocument[], query: string): WorkspaceSymbol[] {
  const normalizedQuery = query.trim().toLowerCase();
  return documents
    .flatMap((document) => collectDocumentSymbols(document))
    .filter((symbol) => {
      if (!normalizedQuery) {
        return true;
      }
      return `${symbol.name} ${symbol.containerName ?? ""}`.toLowerCase().includes(normalizedQuery);
    })
    .slice(0, 100)
    .map((symbol) => ({
      name: symbol.name,
      kind: symbol.kind,
      location: symbol.location,
      containerName: symbol.containerName,
    }));
}

export function collectExportedSymbolLocations(document: TextDocument): Map<string, Location[]> {
  const result = new Map<string, Location[]>();
  const declarations = extractTopLevelDeclarationsFromParser(document);
  const sourceDeclarations = declarations.length > 0 ? declarations : extractTopLevelDeclarations(document);

  for (const declaration of sourceDeclarations) {
    if (!declaration.exported) {
      continue;
    }

    const location = createLocation(document, declaration.lineIndex, declaration.line, declaration.name);
    result.set(declaration.name, [...(result.get(declaration.name) ?? []), location]);
  }

  return result;
}

export function mapSymbolKindToCompletionKind(symbolKind: SymbolKind): CompletionItemKind {
  switch (symbolKind) {
    case SymbolKind.Class:
      return CompletionItemKind.Class;
    case SymbolKind.Interface:
      return CompletionItemKind.Interface;
    case SymbolKind.Enum:
      return CompletionItemKind.Enum;
    case SymbolKind.Function:
      return CompletionItemKind.Function;
    case SymbolKind.Variable:
      return CompletionItemKind.Variable;
    case SymbolKind.TypeParameter:
      return CompletionItemKind.TypeParameter;
    default:
      return CompletionItemKind.Text;
  }
}

export function mapTypeMemberKindToCompletionKind(memberKind: TypeMemberKind): CompletionItemKind {
  return memberKind === "method" ? CompletionItemKind.Method : CompletionItemKind.Field;
}

export function symbolKindLabel(symbolKind: SymbolKind): string {
  switch (symbolKind) {
    case SymbolKind.Class:
      return "Class";
    case SymbolKind.Interface:
      return "Interface";
    case SymbolKind.Enum:
      return "Enum";
    case SymbolKind.Function:
      return "Function";
    case SymbolKind.Variable:
      return "Variable";
    case SymbolKind.TypeParameter:
      return "Type";
    default:
      return "Symbol";
  }
}

export function displayDocumentName(uri: string): string {
  return decodeURIComponent(uri.split("/").at(-1) ?? uri);
}

type TypeMemberKind = "field" | "method";

export type TypeMemberSymbol = {
  name: string;
  kind: TypeMemberKind;
  location: Location;
  containerName: string;
  declarationText: string;
  decorator?: string;
  scopeRange: {
    start: Position;
    end: Position;
  };
};

export function collectTypeMemberSymbols(document: TextDocument, typeName: string): TypeMemberSymbol[] {
  const parserMembers = collectTypeMemberSymbolsFromParser(document, typeName);
  if (parserMembers.length > 0) {
    return parserMembers;
  }

  const lines = document.getText().split(/\r?\n/u);
  const classIndex = lines.findIndex((line) => matchArktsTypeDeclaration(line)?.name === typeName);
  if (classIndex < 0) {
    return [];
  }

  const members: TypeMemberSymbol[] = [];
  let braceDepth = 0;
  let bodyDepth = -1;
  let scopeStartLine = classIndex;
  let pendingDecorators: string[] = [];

  for (let lineIndex = classIndex; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const trimmed = line.trim();

    if (bodyDepth > 0 && braceDepth === bodyDepth && trimmed) {
      const { body, decorators } = peelLeadingDecorators(trimmed);
      const effectiveDecorators = [...pendingDecorators, ...decorators];
      const decorator = effectiveDecorators.at(-1);
      if (body.length === 0 && effectiveDecorators.length > 0) {
        pendingDecorators = effectiveDecorators;
        continue;
      }

      const methodMatch = body.match(/^(?:public\s+|private\s+|protected\s+)?(static\s+)?([A-Za-z_]\w*)\s*\(/u);
      if (methodMatch && methodMatch[2] !== "constructor") {
        members.push({
          name: methodMatch[2],
          kind: "method",
          location: createLocation(document, lineIndex, line, methodMatch[2]),
          containerName: typeName,
          declarationText: trimmed,
          decorator,
          scopeRange: {
            start: { line: scopeStartLine, character: 0 },
            end: { line: scopeStartLine, character: 0 },
          },
        });
      }

      const propertyMatch = body.match(/^(?:public\s+|private\s+|protected\s+)?(static\s+)?(?:readonly\s+)?([A-Za-z_]\w*)\s*(?::|=)/u);
      if (propertyMatch) {
        members.push({
          name: propertyMatch[2],
          kind: "field",
          location: createLocation(document, lineIndex, line, propertyMatch[2]),
          containerName: typeName,
          declarationText: trimmed,
          decorator,
          scopeRange: {
            start: { line: scopeStartLine, character: 0 },
            end: { line: scopeStartLine, character: 0 },
          },
        });
      }

      pendingDecorators = [];
    } else if (bodyDepth > 0 && braceDepth === bodyDepth) {
      pendingDecorators = [];
    }

    for (const char of line) {
      if (char === "{") {
        braceDepth += 1;
        if (bodyDepth < 0) {
          bodyDepth = braceDepth;
          scopeStartLine = lineIndex;
        }
      } else if (char === "}") {
        if (bodyDepth > 0 && braceDepth === bodyDepth) {
          const scopeRange = {
            start: { line: scopeStartLine, character: 0 },
            end: { line: lineIndex, character: line.length },
          };
          return dedupeTypeMembers(members).map((member) => ({
            ...member,
            scopeRange,
          }));
        }
        braceDepth -= 1;
      }
    }
  }

  return dedupeTypeMembers(members);
}

export function findDocumentMemberSymbolAtPosition(document: TextDocument, position: Position): TypeMemberSymbol | null {
  const enclosingType = getEnclosingTypeContextAtPosition(document, position);
  const word = getWordAtPosition(document, position);
  if (!enclosingType || !word) {
    return null;
  }

  const member = collectTypeMemberSymbols(document, enclosingType.name).find((candidate) => candidate.name === word);
  if (!member || !isPositionWithinRange(position, member.scopeRange)) {
    return null;
  }

  return member;
}

export function collectAllTypeMemberSymbols(document: TextDocument): TypeMemberSymbol[] {
  return collectDocumentSymbols(document)
    .filter((symbol) => symbol.kind === SymbolKind.Class)
    .flatMap((symbol) => collectTypeMemberSymbols(document, symbol.name));
}

export function typeMemberLabel(member: TypeMemberSymbol): string {
  if (member.kind === "method") {
    return "Method";
  }
  if (member.decorator) {
    return `${member.decorator.replace(/^./u, (value) => value.toUpperCase())} field`;
  }
  return "Field";
}

interface TopLevelDeclaration {
  name: string;
  kind: SymbolKind;
  lineIndex: number;
  line: string;
  containerName?: string;
  exported: boolean;
}

function extractTopLevelDeclarations(document: TextDocument): TopLevelDeclaration[] {
  const lines = document.getText().split(/\r?\n/u);
  const declarations: TopLevelDeclaration[] = [];
  let pendingDecorators: string[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      pendingDecorators = [];
      continue;
    }

    const { body, decorators } = peelLeadingDecorators(trimmed);
    const effectiveDecorators = [...pendingDecorators, ...decorators];
    const declaration = parseTopLevelDeclaration(body, effectiveDecorators);

    if (declaration) {
      declarations.push({
        ...declaration,
        lineIndex,
        line,
      });
      pendingDecorators = [];
      continue;
    }

    if (body.length === 0 && decorators.length > 0) {
      pendingDecorators = decorators;
      continue;
    }

    pendingDecorators = [];
  }

  return declarations;
}

function peelLeadingDecorators(trimmedLine: string): { body: string; decorators: string[] } {
  const decorators: string[] = [];
  let rest = trimmedLine;

  while (rest.startsWith("@")) {
    const match = rest.match(/^@([A-Za-z_]\w*)(?:\([^)]*\))?\s*/u);
    if (!match) {
      break;
    }

    decorators.push(match[1]);
    rest = rest.slice(match[0].length).trimStart();
  }

  return { body: rest, decorators };
}

function parseTopLevelDeclaration(
  body: string,
  decorators: string[],
): Omit<TopLevelDeclaration, "lineIndex" | "line"> | null {
  const containerName = decorators.at(-1);
  const exported = /^export\b/u.test(body);

  const patterns: Array<{ regex: RegExp; kind: SymbolKind }> = [
    { regex: /^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_]\w*)/u, kind: SymbolKind.Class },
    { regex: /^(?:export\s+(?:default\s+)?)?struct\s+([A-Za-z_]\w*)/u, kind: SymbolKind.Class },
    { regex: /^(?:export\s+(?:default\s+)?)?interface\s+([A-Za-z_]\w*)/u, kind: SymbolKind.Interface },
    { regex: /^(?:export\s+(?:default\s+)?)?(?:const\s+)?enum\s+([A-Za-z_]\w*)/u, kind: SymbolKind.Enum },
    { regex: /^(?:export\s+(?:default\s+)?)?type\s+([A-Za-z_]\w*)/u, kind: SymbolKind.TypeParameter },
    { regex: /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z_]\w*)/u, kind: SymbolKind.Function },
    { regex: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_]\w*)/u, kind: SymbolKind.Variable },
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern.regex);
    if (!match) {
      continue;
    }

    return {
      name: match[1],
      kind: pattern.kind,
      containerName,
      exported,
    };
  }

  return null;
}

function createSymbol(
  document: TextDocument,
  lineIndex: number,
  line: string,
  name: string,
  kind: SymbolKind,
  containerName?: string,
): SymbolInformation {
  const startCharacter = Math.max(line.indexOf(name), 0);
  return {
    name,
    kind,
    location: {
      uri: document.uri,
      range: {
        start: { line: lineIndex, character: startCharacter },
        end: { line: lineIndex, character: startCharacter + name.length },
      },
    },
    containerName,
  };
}

function createLocation(document: TextDocument, lineIndex: number, line: string, name: string): Location {
  const startCharacter = Math.max(line.indexOf(name), 0);
  return {
    uri: document.uri,
    range: {
      start: { line: lineIndex, character: startCharacter },
      end: { line: lineIndex, character: startCharacter + name.length },
    },
  };
}

function extractTopLevelDeclarationsFromParser(document: TextDocument): TopLevelDeclaration[] {
  const tree = parseArkTS(document);
  if (!tree) {
    return [];
  }

  const topLevel = getTopLevelDeclarations(tree);
  const declarations: TopLevelDeclaration[] = [
    ...topLevel.structs.map((item) => ({
      name: item.name,
      kind: SymbolKind.Class,
      lineIndex: item.line,
      line: readLine(document, item.line),
      containerName: item.decorators.at(-1),
      exported: item.exported,
    })),
    ...topLevel.functions.map((item) => ({
      name: item.name,
      kind: SymbolKind.Function,
      lineIndex: item.line,
      line: readLine(document, item.line),
      exported: item.exported,
    })),
    ...topLevel.interfaces.map((item) => ({
      name: item.name,
      kind: SymbolKind.Interface,
      lineIndex: item.line,
      line: readLine(document, item.line),
      exported: item.exported,
    })),
    ...topLevel.variables.map((item) => ({
      name: item.name,
      kind: SymbolKind.Variable,
      lineIndex: item.line,
      line: readLine(document, item.line),
      exported: item.exported,
    })),
  ];

  for (const node of findNodesByType(tree, "class_declaration")) {
    if (!isParserTopLevelNode(node)) {
      continue;
    }
    declarations.push({
      name: findParserChildText(node, "type_identifier") ?? "",
      kind: SymbolKind.Class,
      lineIndex: node.startPosition.line,
      line: readLine(document, node.startPosition.line),
      containerName: getDecoratorNames(node).at(-1),
      exported: node.parent?.type === "export_statement",
    });
  }

  return declarations
    .filter((item) => item.name)
    .sort((left, right) => left.lineIndex - right.lineIndex || left.line.indexOf(left.name) - right.line.indexOf(right.name));
}

function collectTypeMemberSymbolsFromParser(document: TextDocument, typeName: string): TypeMemberSymbol[] {
  const tree = parseArkTS(document);
  if (!tree) {
    return [];
  }

  const candidateNodes = [
    ...findNodesByType(tree, "struct_declaration"),
    ...findNodesByType(tree, "class_declaration"),
  ];
  const targetNode = candidateNodes.find((node) => findParserChildText(node, "type_identifier") === typeName);
  if (!targetNode) {
    return [];
  }

  const classBody = targetNode.children.find((child) => child.type === "class_body");
  if (!classBody) {
    return [];
  }

  const scopeRange = {
    start: classBody.startPosition,
    end: classBody.endPosition,
  };
  const members: TypeMemberSymbol[] = [];

  for (const child of classBody.children) {
    if (child.type === "public_field_definition") {
      const name = findParserChildText(child, "property_identifier");
      if (!name) {
        continue;
      }
      members.push({
        name,
        kind: "field",
        location: createLocation(document, child.startPosition.line, readLine(document, child.startPosition.line), name),
        containerName: typeName,
        declarationText: singleLine(child.text),
        decorator: getDecoratorNames(child).at(-1),
        scopeRange,
      });
      continue;
    }

    if (child.type === "method_definition") {
      const name = findParserChildText(child, "property_identifier");
      if (!name || name === "constructor") {
        continue;
      }
      members.push({
        name,
        kind: "method",
        location: createLocation(document, child.startPosition.line, readLine(document, child.startPosition.line), name),
        containerName: typeName,
        declarationText: singleLine(child.text),
        decorator: getDecoratorNames(child).at(-1),
        scopeRange,
      });
    }
  }

  return dedupeTypeMembers(members);
}

function isParserTopLevelNode(node: ArkTSNode): boolean {
  return node.parent?.type === "program" || node.parent?.type === "export_statement";
}

function findParserChildText(node: ArkTSNode, type: string): string | null {
  return node.children.find((child) => child.type === type)?.text ?? null;
}

function readLine(document: TextDocument, line: number): string {
  return document.getText({
    start: { line, character: 0 },
    end: { line: line + 1, character: 0 },
  });
}

function singleLine(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function dedupeTypeMembers(members: TypeMemberSymbol[]): TypeMemberSymbol[] {
  const seen = new Set<string>();
  return members.filter((member) => {
    const key = `${member.name}:${member.kind}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
