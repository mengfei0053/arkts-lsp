import { FoldingRange } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";

export function buildFoldingRanges(document: TextDocument): FoldingRange[] {
  const ranges: FoldingRange[] = [];
  const stack: number[] = [];
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
      const previousCharacter = line[characterIndex - 1];

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
        stack.push(lineIndex);
        previousSignificantCharacter = character;
        continue;
      }

      if (character === "}") {
        const startLine = stack.pop();
        if (startLine !== undefined && startLine < lineIndex) {
          ranges.push({ startLine, endLine: lineIndex });
        }
        previousSignificantCharacter = character;
        continue;
      }

      if (!/\s/u.test(character)) {
        previousSignificantCharacter = character;
      }
    }
  }

  return ranges.sort((left, right) => {
    if (left.startLine !== right.startLine) {
      return left.startLine - right.startLine;
    }

    return right.endLine - left.endLine;
  });
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
