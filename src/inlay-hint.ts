import { InlayHint, InlayHintKind, Range } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { isPositionWithinRange } from "./text.js";
import { resolveCallableSignature } from "./signature.js";

export function buildInlayHints(
  documents: TextDocument[],
  document: TextDocument,
  range: Range,
  resolveImportTarget: (documentUri: string, specifier: string) => TextDocument | null,
): InlayHint[] {
  const lines = document.getText().split(/\r?\n/u);
  const hints: InlayHint[] = [];

  for (let lineIndex = range.start.line; lineIndex <= range.end.line && lineIndex < lines.length; lineIndex += 1) {
    for (const call of collectLineCalls(lines[lineIndex] ?? "", lineIndex)) {
      const signature = resolveCallableSignature(documents, document, call.callee, resolveImportTarget);
      if (!signature) {
        continue;
      }

      const limit = Math.min(call.arguments.length, signature.parameters.length);
      for (let argumentIndex = 0; argumentIndex < limit; argumentIndex += 1) {
        const parameterName = extractParameterName(signature.parameters[argumentIndex] ?? "");
        const argument = call.arguments[argumentIndex];
        if (!parameterName || shouldSkipHint(parameterName, argument.text)) {
          continue;
        }
        if (!isPositionWithinRange(argument.position, range)) {
          continue;
        }

        hints.push({
          position: argument.position,
          label: `${parameterName}:`,
          kind: InlayHintKind.Parameter,
          paddingRight: true,
        });
      }
    }
  }

  return hints;
}

function collectLineCalls(
  line: string,
  lineIndex: number,
): Array<{ callee: string; arguments: Array<{ position: { line: number; character: number }; text: string }> }> {
  const calls: Array<{ callee: string; arguments: Array<{ position: { line: number; character: number }; text: string }> }> = [];
  let quote: string | null = null;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char !== "(") {
      continue;
    }

    const calleeMatch = line.slice(0, index).match(/([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*$/u);
    if (!calleeMatch) {
      continue;
    }

    const prefix = line.slice(0, index - calleeMatch[0].length).trimEnd();
    if (looksLikeNonCallPrefix(prefix)) {
      continue;
    }

    const closingIndex = findClosingParen(line, index);
    if (closingIndex < 0) {
      continue;
    }

    calls.push({
      callee: calleeMatch[1],
      arguments: collectArguments(line, lineIndex, index + 1, closingIndex),
    });
    index = closingIndex;
  }

  return calls;
}

function collectArguments(
  line: string,
  lineIndex: number,
  start: number,
  end: number,
): Array<{ position: { line: number; character: number }; text: string }> {
  const argumentsWithPositions: Array<{ position: { line: number; character: number }; text: string }> = [];
  let segmentStart = start;
  let quote: string | null = null;
  let escaped = false;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;

  for (let index = start; index <= end; index += 1) {
    const char = line[index];
    const atBoundary = index === end;
    if (!atBoundary) {
      if (quote) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === quote) {
          quote = null;
        }
        continue;
      }

      if (char === '"' || char === "'" || char === "`") {
        quote = char;
        continue;
      }

      if (char === "(") {
        parenDepth += 1;
        continue;
      }
      if (char === ")") {
        parenDepth = Math.max(0, parenDepth - 1);
        continue;
      }
      if (char === "{") {
        braceDepth += 1;
        continue;
      }
      if (char === "}") {
        braceDepth = Math.max(0, braceDepth - 1);
        continue;
      }
      if (char === "[") {
        bracketDepth += 1;
        continue;
      }
      if (char === "]") {
        bracketDepth = Math.max(0, bracketDepth - 1);
        continue;
      }
    }

    if (!atBoundary && (char !== "," || parenDepth > 0 || braceDepth > 0 || bracketDepth > 0)) {
      continue;
    }

    const rawArgument = line.slice(segmentStart, index);
    const trimmedArgument = rawArgument.trim();
    if (trimmedArgument) {
      const leadingWhitespace = rawArgument.match(/^\s*/u)?.[0].length ?? 0;
      argumentsWithPositions.push({
        position: {
          line: lineIndex,
          character: segmentStart + leadingWhitespace,
        },
        text: trimmedArgument,
      });
    }
    segmentStart = index + 1;
  }

  return argumentsWithPositions;
}

function findClosingParen(line: string, openParenIndex: number): number {
  let quote: string | null = null;
  let escaped = false;
  let depth = 0;

  for (let index = openParenIndex; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function extractParameterName(parameter: string): string | null {
  const match = parameter.match(/^\s*(?:\.\.\.)?([A-Za-z_]\w*)\??\b/u);
  return match?.[1] ?? null;
}

function shouldSkipHint(parameterName: string, argumentText: string): boolean {
  if (/^[\[{]/u.test(argumentText)) {
    return true;
  }

  return new RegExp(`^(?:this\\.)?${escapeRegExp(parameterName)}$`, "u").test(argumentText);
}

function looksLikeNonCallPrefix(prefix: string): boolean {
  return /\b(?:function|if|for|while|switch|catch|class|struct|new)\s*$/u.test(prefix);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
