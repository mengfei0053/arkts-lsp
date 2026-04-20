import { Location, Position } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { CallContext, EnclosingTypeContext, ImportBinding, ImportContext, MemberAccessContext, NamedImportContext } from "./types.js";

export function collectImportBindings(document: TextDocument): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  const lines = document.getText().split(/\r?\n/u);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const match = line.match(/^\s*import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/u);
    if (!match || match.index === undefined) {
      continue;
    }

    const specifier = match[2];
    const clause = match[1];
    const clauseOffset = line.indexOf(clause);
    if (clauseOffset < 0) {
      continue;
    }

    for (const entry of clause.split(",")) {
      const rawPart = entry.trim();
      if (!rawPart) {
        continue;
      }

      const aliasMatch = rawPart.match(/^([A-Za-z_]\w*)\s+as\s+([A-Za-z_]\w*)$/u);
      const importedName = aliasMatch ? aliasMatch[1] : rawPart;
      const localName = aliasMatch ? aliasMatch[2] : rawPart;
      const localNameOffset = line.indexOf(localName, clauseOffset);
      if (localNameOffset < 0) {
        continue;
      }

      bindings.push({
        importedName,
        localName,
        specifier,
        range: {
          start: { line: lineIndex, character: localNameOffset },
          end: { line: lineIndex, character: localNameOffset + localName.length },
        },
      });
    }
  }

  return bindings;
}

export function getWordAtPosition(document: TextDocument, position: Position): string | null {
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  });
  const safeCharacter = Math.min(position.character, line.length);
  const isWord = (value: string): boolean => /[A-Za-z0-9_]/u.test(value);

  let start = safeCharacter;
  while (start > 0 && isWord(line[start - 1] ?? "")) {
    start -= 1;
  }

  let end = safeCharacter;
  while (end < line.length && isWord(line[end] ?? "")) {
    end += 1;
  }

  return start === end ? null : line.slice(start, end);
}

export function getImportBindingAtPosition(document: TextDocument, position: Position): ImportBinding | null {
  const word = getWordAtPosition(document, position);
  if (!word) {
    return null;
  }

  const exactBinding = collectImportBindings(document).find((binding) => {
    return (
      binding.localName === word &&
      binding.range.start.line === position.line &&
      position.character >= binding.range.start.character &&
      position.character <= binding.range.end.character
    );
  });

  return exactBinding ?? collectImportBindings(document).find((binding) => binding.localName === word) ?? null;
}

export function getImportContextAtPosition(document: TextDocument, position: Position): ImportContext | null {
  return collectImportContexts(document).find((context) => isPositionWithinRange(position, context.range)) ?? null;
}

export function collectImportContexts(document: TextDocument): ImportContext[] {
  const contexts: ImportContext[] = [];
  const lines = document.getText().split(/\r?\n/u);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const importMatch = line.match(/^\s*import\s+.*?from\s+["']([^"']*)["']/u) ?? line.match(/^\s*import\s+["']([^"']*)["']/u);
    if (!importMatch || importMatch.index === undefined) {
      continue;
    }

    const specifier = importMatch[1];
    const relativeStart = importMatch[0].lastIndexOf(specifier);
    if (relativeStart < 0) {
      continue;
    }

    const absoluteStart = importMatch.index + relativeStart;
    contexts.push({
      specifier,
      range: {
        start: { line: lineIndex, character: absoluteStart },
        end: { line: lineIndex, character: absoluteStart + specifier.length },
      },
    });
  }

  return contexts;
}

export function getNamedImportContextAtPosition(document: TextDocument, position: Position): NamedImportContext | null {
  const lines = document.getText().split(/\r?\n/u);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const match = line.match(/^\s*import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/u);
    if (!match || match.index === undefined || position.line !== lineIndex) {
      continue;
    }

    const clauseStart = line.indexOf("{");
    const clauseEnd = line.indexOf("}", clauseStart + 1);
    if (clauseStart < 0 || clauseEnd < 0) {
      continue;
    }
    if (position.character <= clauseStart || position.character > clauseEnd) {
      continue;
    }

    return {
      specifier: match[2],
      importedPrefix: deriveNamedImportPrefix(match[1], position.character - clauseStart - 1),
      range: {
        start: { line: lineIndex, character: clauseStart + 1 },
        end: { line: lineIndex, character: clauseEnd },
      },
    };
  }

  return null;
}

export function getMemberAccessContextAtPosition(document: TextDocument, position: Position): MemberAccessContext | null {
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  });
  const safeCharacter = Math.min(position.character, line.length);
  const match = line.slice(0, safeCharacter).match(/([A-Za-z_]\w*)\.([A-Za-z_]\w*)?$/u);
  if (!match) {
    return null;
  }

  const receiverStart = safeCharacter - match[0].length;
  return {
    receiver: match[1],
    prefix: match[2] ?? "",
    range: {
      start: { line: position.line, character: receiverStart },
      end: { line: position.line, character: safeCharacter },
    },
  };
}

export function getEnclosingTypeContextAtPosition(document: TextDocument, position: Position): EnclosingTypeContext | null {
  const lines = document.getText().split(/\r?\n/u);
  let braceDepth = 0;
  let pendingType: EnclosingTypeContext | null = null;
  const typeStack: Array<EnclosingTypeContext & { bodyDepth: number }> = [];

  for (let lineIndex = 0; lineIndex <= position.line && lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const limit = lineIndex === position.line ? Math.min(position.character, line.length) : line.length;

    if (!pendingType) {
      const declaration = matchArktsTypeDeclaration(line);
      if (declaration) {
        pendingType = declaration;
      }
    }

    for (let index = 0; index < limit; index += 1) {
      const char = line[index];
      if (char === "{") {
        braceDepth += 1;
        if (pendingType) {
          typeStack.push({ ...pendingType, bodyDepth: braceDepth });
          pendingType = null;
        }
      } else if (char === "}") {
        while (typeStack.length > 0 && braceDepth === typeStack[typeStack.length - 1].bodyDepth) {
          typeStack.pop();
        }
        braceDepth = Math.max(0, braceDepth - 1);
      }
    }
  }

  const enclosingType = typeStack.at(-1);
  return enclosingType ? { name: enclosingType.name, kind: enclosingType.kind } : null;
}

export function matchArktsTypeDeclaration(line: string): EnclosingTypeContext | null {
  const declaration = line.trim().replace(/^(?:@[A-Za-z_]\w*(?:\([^)]*\))?\s+)*/u, "");
  const declarationMatch = declaration.match(/^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(class|struct)\s+([A-Za-z_]\w*)\b/u);
  if (!declarationMatch) {
    return null;
  }

  return {
    kind: declarationMatch[1] as "class" | "struct",
    name: declarationMatch[2],
  };
}

export function getCallContextAtPosition(document: TextDocument, position: Position): CallContext | null {
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  });
  const beforeCursor = line.slice(0, Math.min(position.character, line.length));

  let argumentIndex = 0;
  let depth = 0;
  let openParenIndex = -1;

  for (let index = beforeCursor.length - 1; index >= 0; index -= 1) {
    const char = beforeCursor[index];
    if (char === ")") {
      depth += 1;
    } else if (char === "(") {
      if (depth === 0) {
        openParenIndex = index;
        break;
      }
      depth -= 1;
    } else if (char === "," && depth === 0) {
      argumentIndex += 1;
    }
  }

  if (openParenIndex < 0) {
    return null;
  }

  const calleeMatch = beforeCursor.slice(0, openParenIndex).match(/([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*$/u);
  return calleeMatch ? { callee: calleeMatch[1], argumentIndex } : null;
}

export function collectWordLocations(document: TextDocument, word: string): Location[] {
  const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gu");
  const lines = document.getText().split(/\r?\n/u);
  const locations: Location[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const match of line.matchAll(pattern)) {
      const startCharacter = match.index ?? 0;
      if (isInsideQuotedString(line, startCharacter)) {
        continue;
      }
      locations.push({
        uri: document.uri,
        range: {
          start: { line: lineIndex, character: startCharacter },
          end: { line: lineIndex, character: startCharacter + word.length },
        },
      });
    }
  }

  return locations;
}

export function locationKey(location: Location): string {
  return `${location.uri}:${location.range.start.line}:${location.range.start.character}:${location.range.end.line}:${location.range.end.character}`;
}

export function isPositionWithinRange(position: Position, range: { start: Position; end: Position }): boolean {
  if (position.line < range.start.line || position.line > range.end.line) {
    return false;
  }
  if (position.line === range.start.line && position.character < range.start.character) {
    return false;
  }
  if (position.line === range.end.line && position.character > range.end.character) {
    return false;
  }
  return true;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function escapeMarkdown(value: string): string {
  return value.replace(/[`\\]/gu, "\\$&");
}

function deriveNamedImportPrefix(clause: string, offset: number): string {
  const safeOffset = Math.max(0, Math.min(offset, clause.length));
  const segment = (clause.slice(0, safeOffset).split(",").at(-1) ?? "").trim();
  return (segment.split(/\s+as\s+/u).at(-1) ?? "").trim();
}

function isInsideQuotedString(line: string, index: number): boolean {
  const before = line.slice(0, index);
  return (
    countUnescaped(before, "'") % 2 === 1 ||
    countUnescaped(before, '"') % 2 === 1 ||
    countUnescaped(before, "`") % 2 === 1
  );
}

function countUnescaped(text: string, quote: string): number {
  let count = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === quote && text[index - 1] !== "\\") {
      count += 1;
    }
  }
  return count;
}
