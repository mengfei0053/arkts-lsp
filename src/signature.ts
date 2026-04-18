import { SignatureHelp } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { collectImportBindings, escapeRegExp, getCallContextAtPosition } from "./text.js";

export function buildSignatureHelp(
  documents: TextDocument[],
  document: TextDocument,
  position: { line: number; character: number },
  resolveImportTarget: (documentUri: string, specifier: string) => TextDocument | null,
): SignatureHelp | null {
  const context = getCallContextAtPosition(document, position);
  if (!context) {
    return null;
  }

  const signature = resolveCallableSignature(documents, document, context.callee, resolveImportTarget);
  if (!signature) {
    return null;
  }

  return {
    signatures: [
      {
        label: signature.label,
        documentation: signature.documentation,
        parameters: signature.parameters.map((parameter) => ({ label: parameter })),
      },
    ],
    activeSignature: 0,
    activeParameter: Math.min(context.argumentIndex, Math.max(signature.parameters.length - 1, 0)),
  };
}

function resolveCallableSignature(
  documents: TextDocument[],
  document: TextDocument,
  callee: string,
  resolveImportTarget: (documentUri: string, specifier: string) => TextDocument | null,
): { label: string; parameters: string[]; documentation?: string } | null {
  if (callee.includes(".")) {
    const [receiver, memberName] = callee.split(".", 2);
    const importBinding = collectImportBindings(document).find((binding) => binding.localName === receiver);
    if (importBinding) {
      const targetDocument = resolveImportTarget(document.uri, importBinding.specifier);
      const importedMethod = targetDocument
        ? collectClassMethodSignatures(targetDocument, importBinding.importedName).find((signature) => signature.name === memberName)
        : null;
      if (importedMethod) {
        return importedMethod;
      }
    }

    return collectClassMethodSignatures(document, receiver).find((signature) => signature.name === memberName) ?? null;
  }

  const importBinding = collectImportBindings(document).find((binding) => binding.localName === callee);
  if (importBinding) {
    const targetDocument = resolveImportTarget(document.uri, importBinding.specifier);
    const importedFunction = targetDocument
      ? collectTopLevelFunctionSignatures(targetDocument).find((signature) => signature.name === importBinding.importedName)
      : null;
    if (importedFunction) {
      return {
        ...importedFunction,
        label:
          importBinding.localName === importBinding.importedName
            ? importedFunction.label
            : importedFunction.label.replace(importBinding.importedName, importBinding.localName),
      };
    }
  }

  return (
    collectTopLevelFunctionSignatures(document).find((signature) => signature.name === callee) ??
    documents.flatMap((candidate) => collectTopLevelFunctionSignatures(candidate)).find((signature) => signature.name === callee) ??
    null
  );
}

function collectClassMethodSignatures(
  document: TextDocument,
  className: string,
): Array<{ name: string; parameters: string[]; label: string; documentation?: string }> {
  const lines = document.getText().split(/\r?\n/u);
  const classIndex = lines.findIndex((line) =>
    new RegExp(`^\\s*(?:export\\s+)?(?:abstract\\s+)?class\\s+${escapeRegExp(className)}\\b`, "u").test(line.trim()),
  );
  if (classIndex < 0) {
    return [];
  }

  const signatures: Array<{ name: string; parameters: string[]; label: string; documentation?: string }> = [];
  let braceDepth = 0;
  let inClassBody = false;

  for (let lineIndex = classIndex; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const char of line) {
      if (char === "{") {
        braceDepth += 1;
        inClassBody = true;
      } else if (char === "}") {
        braceDepth -= 1;
        if (inClassBody && braceDepth <= 0) {
          return signatures;
        }
      }
    }

    if (!inClassBody) {
      continue;
    }

    const match = line.match(
      /^\s*(?:public\s+|private\s+|protected\s+)?static\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?::\s*([^ {]+))?/u,
    );
    if (!match) {
      continue;
    }

    const parameters = parseParameterList(match[2]);
    signatures.push({
      name: match[1],
      parameters,
      label: `${className}.${match[1]}(${parameters.join(", ")})${match[3] ? `: ${match[3]}` : ""}`,
    });
  }

  return signatures;
}

function collectTopLevelFunctionSignatures(
  document: TextDocument,
): Array<{ name: string; parameters: string[]; label: string; documentation?: string }> {
  return document
    .getText()
    .split(/\r?\n/u)
    .flatMap((line) => {
      const match = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?::\s*([^ {]+))?/u);
      if (!match) {
        return [];
      }
      const parameters = parseParameterList(match[2]);
      return [
        {
          name: match[1],
          parameters,
          label: `${match[1]}(${parameters.join(", ")})${match[3] ? `: ${match[3]}` : ""}`,
        },
      ];
    });
}

function parseParameterList(source: string): string[] {
  return source.split(",").map((parameter) => parameter.trim()).filter(Boolean);
}
