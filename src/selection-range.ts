import { Position, Range, SelectionRange } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { isPositionWithinRange } from "./text.js";

type BracePair = {
  open: Position;
  close: Position;
};

export function buildSelectionRanges(document: TextDocument, positions: Position[]): SelectionRange[] {
  const bracePairs = collectBracePairs(document);
  return positions.map((position) => buildSelectionRange(document, position, bracePairs));
}

export function buildSelectionRangeResponse(document: TextDocument | null, positions: Position[]): SelectionRange[] {
  return document
    ? buildSelectionRanges(document, positions)
    : positions.map((position) => ({ range: { start: position, end: position } }));
}

function buildSelectionRange(document: TextDocument, position: Position, bracePairs: BracePair[]): SelectionRange {
  const ranges = [
    getWordRange(document, position),
    getExpressionRange(document, position),
    getStatementRange(document, position),
    ...getContainingBlockRanges(document, position, bracePairs),
  ].flatMap((range) => (range ? [range] : []));

  const uniqueRanges = ranges.filter((range, index) => {
    return ranges.findIndex((candidate) => isSameRange(candidate, range)) === index;
  });

  const fallbackRange = uniqueRanges[0] ?? fullDocumentRange(document);
  const [firstRange, ...parentRanges] = uniqueRanges;

  if (!firstRange) {
    return { range: fallbackRange };
  }

  return parentRanges.reduce<SelectionRange>((selectionRange, currentRange) => {
    let tail = selectionRange;
    while (tail.parent) {
      tail = tail.parent;
    }
    tail.parent = { range: currentRange };
    return selectionRange;
  }, { range: firstRange });
}

function getWordRange(document: TextDocument, position: Position): Range | null {
  const line = getLine(document, position.line);
  const safeCharacter = Math.min(position.character, line.length);

  let start = safeCharacter;
  while (start > 0 && /[A-Za-z0-9_]/u.test(line[start - 1] ?? "")) {
    start -= 1;
  }

  let end = safeCharacter;
  while (end < line.length && /[A-Za-z0-9_]/u.test(line[end] ?? "")) {
    end += 1;
  }

  return start === end ? null : range(position.line, start, position.line, end);
}

function getExpressionRange(document: TextDocument, position: Position): Range | null {
  const line = getLine(document, position.line);
  const statement = getStatementRange(document, position);
  if (!statement || !isPositionWithinRange(position, statement)) {
    return null;
  }

  const statementText = line.slice(statement.start.character, statement.end.character);
  const expressionOffset = getExpressionOffset(statementText, position.character - statement.start.character);
  if (!expressionOffset) {
    return null;
  }

  return range(
    position.line,
    statement.start.character + expressionOffset.start,
    position.line,
    statement.start.character + expressionOffset.end,
  );
}

function getStatementRange(document: TextDocument, position: Position): Range | null {
  const line = getLine(document, position.line);
  const startCharacter = line.search(/\S/u);
  if (startCharacter < 0) {
    return null;
  }

  const endCharacter = line.trimEnd().length;
  if (position.character < startCharacter || position.character > endCharacter) {
    return null;
  }

  return range(position.line, startCharacter, position.line, endCharacter);
}

function getContainingBlockRanges(document: TextDocument, position: Position, bracePairs: BracePair[]): Range[] {
  return bracePairs
    .filter((pair) => isPositionInsideBracePair(position, pair))
    .map((pair) => {
      const openLine = getLine(document, pair.open.line);
      const startCharacter = openLine.search(/\S/u);
      return range(pair.open.line, Math.max(0, startCharacter), pair.close.line, pair.close.character + 1);
    })
    .sort(compareRanges);
}

function getExpressionOffset(statementText: string, relativeCharacter: number): { start: number; end: number } | null {
  const trimmedEnd = statementText.endsWith(";") ? statementText.length - 1 : statementText.length;
  const prefixes = [/^(return|throw|yield)\s+/u, /^[A-Za-z_$][\w$]*\s*=\s*/u];

  for (const prefix of prefixes) {
    const match = statementText.match(prefix);
    if (!match) {
      continue;
    }

    const start = match[0].length;
    if (relativeCharacter < start || relativeCharacter > trimmedEnd) {
      return null;
    }
    return start < trimmedEnd ? { start, end: trimmedEnd } : null;
  }

  return null;
}

function collectBracePairs(document: TextDocument): BracePair[] {
  const pairs: BracePair[] = [];
  const stack: Position[] = [];
  const lines = document.getText().split(/\r?\n/u);
  let inBlockComment = false;
  let inRegularExpression = false;
  let inRegularExpressionCharacterClass = false;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateString = false;
  let previousSignificantCharacter: string | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];

    for (let characterIndex = 0; characterIndex < line.length; characterIndex += 1) {
      const character = line[characterIndex];
      const nextCharacter = line[characterIndex + 1];

      if (inBlockComment) {
        if (character === "*" && nextCharacter === "/") {
          inBlockComment = false;
          characterIndex += 1;
        }
        continue;
      }

      if (inRegularExpression) {
        if (character === "[" && !isEscaped(line, characterIndex)) {
          inRegularExpressionCharacterClass = true;
          continue;
        }

        if (character === "]" && !isEscaped(line, characterIndex)) {
          inRegularExpressionCharacterClass = false;
          continue;
        }

        if (character === "/" && !isEscaped(line, characterIndex) && !inRegularExpressionCharacterClass) {
          inRegularExpression = false;
          previousSignificantCharacter = "/";
        }
        continue;
      }

      if (inSingleQuote) {
        if (character === "'" && !isEscaped(line, characterIndex)) {
          inSingleQuote = false;
        }
        continue;
      }

      if (inDoubleQuote) {
        if (character === '"' && !isEscaped(line, characterIndex)) {
          inDoubleQuote = false;
        }
        continue;
      }

      if (inTemplateString) {
        if (character === "`" && !isEscaped(line, characterIndex)) {
          inTemplateString = false;
        }
        continue;
      }

      if (character === "/" && nextCharacter === "/") {
        break;
      }

      if (character === "/" && nextCharacter === "*") {
        inBlockComment = true;
        characterIndex += 1;
        continue;
      }

      if (character === "/" && startsRegularExpression(previousSignificantCharacter, line.slice(0, characterIndex))) {
        inRegularExpression = true;
        inRegularExpressionCharacterClass = false;
        continue;
      }

      if (character === "'") {
        inSingleQuote = true;
        continue;
      }

      if (character === '"') {
        inDoubleQuote = true;
        continue;
      }

      if (character === "`") {
        inTemplateString = true;
        continue;
      }

      if (character === "{") {
        stack.push({ line: lineIndex, character: characterIndex });
        previousSignificantCharacter = character;
        continue;
      }

      if (character === "}") {
        const open = stack.pop();
        if (open) {
          pairs.push({ open, close: { line: lineIndex, character: characterIndex } });
        }
        previousSignificantCharacter = character;
        continue;
      }

      if (!/\s/u.test(character)) {
        previousSignificantCharacter = character;
      }
    }
  }

  return pairs;
}

function getLine(document: TextDocument, line: number): string {
  return document.getText({ start: { line, character: 0 }, end: { line: line + 1, character: 0 } }).replace(/\r?\n$/u, "");
}

function fullDocumentRange(document: TextDocument): Range {
  const lastLine = Math.max(0, document.lineCount - 1);
  return range(0, 0, lastLine, getLine(document, lastLine).length);
}

function isPositionInsideBracePair(position: Position, pair: BracePair): boolean {
  return isPositionWithinRange(position, { start: pair.open, end: pair.close });
}

function isSameRange(left: Range, right: Range): boolean {
  return (
    left.start.line === right.start.line &&
    left.start.character === right.start.character &&
    left.end.line === right.end.line &&
    left.end.character === right.end.character
  );
}

function compareRanges(left: Range, right: Range): number {
  if (left.start.line !== right.start.line) {
    return right.start.line - left.start.line;
  }
  if (left.start.character !== right.start.character) {
    return right.start.character - left.start.character;
  }
  if (left.end.line !== right.end.line) {
    return left.end.line - right.end.line;
  }
  return left.end.character - right.end.character;
}

function range(startLine: number, startCharacter: number, endLine: number, endCharacter: number): Range {
  return {
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter },
  };
}

function startsRegularExpression(previousSignificantCharacter: string | null, prefix: string): boolean {
  const trimmedPrefix = prefix.trimEnd();
  if (trimmedPrefix.length === 0) {
    return true;
  }

  if (/\+\+$|--$/u.test(trimmedPrefix)) {
    return false;
  }

  if (previousSignificantCharacter !== null && /[([{=,:;!&|?+\-*%^~<>]/u.test(previousSignificantCharacter)) {
    return true;
  }

  return ["case", "delete", "do", "else", "return", "throw", "typeof", "void"].includes(getTrailingWord(trimmedPrefix));
}

function getTrailingWord(prefix: string): string {
  const match = prefix.trimEnd().match(/([A-Za-z_][A-Za-z0-9_]*)$/u);
  return match?.[1] ?? "";
}

function isEscaped(text: string, index: number): boolean {
  let backslashCount = 0;

  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
}
