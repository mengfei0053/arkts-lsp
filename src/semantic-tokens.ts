import {
  SemanticTokens,
  SemanticTokensLegend,
  SemanticTokenTypes,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";

const builtinTypePattern = /(?:string|number|boolean|void|any|unknown|never|object|undefined|null|symbol|bigint|Uint8Array|Array|ReadonlyArray)/u;
const controlKeywordPattern = /^(?:if|for|while|switch|catch|return|new|typeof|instanceof)$/u;

type TokenType = "keyword" | "type" | "function" | "variable" | "decorator" | "property";

type CollectedToken = {
  line: number;
  start: number;
  length: number;
  type: TokenType;
};

export const semanticTokenLegend: SemanticTokensLegend = {
  tokenTypes: [
    SemanticTokenTypes.keyword,
    SemanticTokenTypes.type,
    SemanticTokenTypes.function,
    SemanticTokenTypes.variable,
    SemanticTokenTypes.decorator,
    SemanticTokenTypes.property,
  ],
  tokenModifiers: [],
};

const tokenTypeIndex = new Map<TokenType, number>([
  ["keyword", semanticTokenLegend.tokenTypes.indexOf(SemanticTokenTypes.keyword)],
  ["type", semanticTokenLegend.tokenTypes.indexOf(SemanticTokenTypes.type)],
  ["function", semanticTokenLegend.tokenTypes.indexOf(SemanticTokenTypes.function)],
  ["variable", semanticTokenLegend.tokenTypes.indexOf(SemanticTokenTypes.variable)],
  ["decorator", semanticTokenLegend.tokenTypes.indexOf(SemanticTokenTypes.decorator)],
  ["property", semanticTokenLegend.tokenTypes.indexOf(SemanticTokenTypes.property)],
]);

export function buildSemanticTokens(document: TextDocument): SemanticTokens {
  return {
    data: encodeSemanticTokens(collectSemanticTokens(document)),
  };
}

function collectSemanticTokens(document: TextDocument): CollectedToken[] {
  const lines = document.getText().split(/\r?\n/u);
  const tokensByLine = new Map<number, CollectedToken[]>();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";

    collectMatches(line, /@[A-Za-z_]\w*/gu, "decorator", lineIndex, tokensByLine);
    collectMatches(line, /\b(?:class|struct|interface|enum|type|function|const|let|var|extends|implements|export|default|async)\b/gu, "keyword", lineIndex, tokensByLine);
    collectMatches(line, /\b(?:class|struct|interface|enum|type)\s+([A-Za-z_]\w*)\b/gu, "type", lineIndex, tokensByLine, 1);
    collectMatches(line, /\b(?:function|struct|class)\s+([A-Za-z_]\w*)\s*(?=\(|\{|<)/gu, "function", lineIndex, tokensByLine, 1);
    collectMatches(line, /\b(?:const|let|var)\s+([A-Za-z_]\w*)\b/gu, "variable", lineIndex, tokensByLine, 1);
    collectMatches(line, /^\s*(?:@[A-Za-z_]\w*\s+)?(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:readonly\s+)?([A-Za-z_]\w*)\s*(?::|=)/gu, "property", lineIndex, tokensByLine, 1);
    collectMatches(line, /\bthis\.([A-Za-z_]\w*)\b/gu, "property", lineIndex, tokensByLine, 1);
    collectMatches(line, /\b([A-Za-z_]\w*)\s*(?=\()/gu, "function", lineIndex, tokensByLine, 1, (value) => !controlKeywordPattern.test(value));
    collectMatches(line, new RegExp(`:\\s*(${builtinTypePattern.source}|[A-Z][A-Za-z0-9_]*)\\b`, "gu"), "type", lineIndex, tokensByLine, 1);
    collectMatches(line, new RegExp(`\\)\\s*:\\s*(${builtinTypePattern.source}|[A-Z][A-Za-z0-9_]*)\\b`, "gu"), "type", lineIndex, tokensByLine, 1);
  }

  return [...tokensByLine.values()]
    .flat()
    .sort((left, right) => left.line - right.line || left.start - right.start || left.length - right.length);
}

function collectMatches(
  line: string,
  pattern: RegExp,
  type: TokenType,
  lineIndex: number,
  tokensByLine: Map<number, CollectedToken[]>,
  captureGroup = 0,
  predicate?: (value: string) => boolean,
): void {
  for (const match of line.matchAll(pattern)) {
    const value = match[captureGroup];
    if (!value) {
      continue;
    }

    if (predicate && !predicate(value)) {
      continue;
    }

    const fullMatch = match[0];
    const baseIndex = match.index ?? -1;
    const valueIndex = captureGroup === 0 ? baseIndex : baseIndex + fullMatch.indexOf(value);
    if (valueIndex < 0) {
      continue;
    }

    addToken(tokensByLine, {
      line: lineIndex,
      start: valueIndex,
      length: value.length,
      type,
    });
  }
}

function addToken(tokensByLine: Map<number, CollectedToken[]>, token: CollectedToken): void {
  const lineTokens = tokensByLine.get(token.line) ?? [];
  const overlaps = lineTokens.some((existing) => {
    return token.start < existing.start + existing.length && existing.start < token.start + token.length;
  });
  if (overlaps) {
    return;
  }

  lineTokens.push(token);
  tokensByLine.set(token.line, lineTokens);
}

function encodeSemanticTokens(tokens: CollectedToken[]): number[] {
  const data: number[] = [];
  let previousLine = 0;
  let previousStart = 0;

  for (const token of tokens) {
    const deltaLine = token.line - previousLine;
    const deltaStart = deltaLine === 0 ? token.start - previousStart : token.start;
    data.push(deltaLine, deltaStart, token.length, tokenTypeIndex.get(token.type) ?? 0, 0);
    previousLine = token.line;
    previousStart = token.start;
  }

  return data;
}
