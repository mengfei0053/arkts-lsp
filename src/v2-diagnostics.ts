import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node.js";
import {
  getComputedMethods,
  getObservedV2Classes,
  getStructDeclarations,
  getV2ComponentInfo,
  parseArkTS,
} from "./parser.js";

// ─── Decorator Classification ──────────────────────────────────────────────

const V1_FIELD_DECORATORS = new Set([
  "State", "Prop", "Link", "Provide", "Consume", "ObjectLink", "Watch",
]);

const V2_FIELD_DECORATORS = new Set([
  "Local", "Param", "Event", "Monitor", "Provider", "Consumer", "Computed", "Trace",
]);

const V2_ONLY_DECORATORS = new Set(["Param", "Event"]);

type ArkTSTree = Exclude<ReturnType<typeof parseArkTS>, null>;
type ArkTSNode = import("./parser.js").ArkTSNode;

// ─── Field decorator extraction (ERROR-recovery aware) ─────────────────────

interface FieldDecoratorEntry {
  decoratorName: string;
  fieldName: string;
  structName: string;
  line: number;
  node: ArkTSNode;
}

function collectFieldDecorators(tree: ArkTSTree): FieldDecoratorEntry[] {
  const results: FieldDecoratorEntry[] = [];
  const structs = getStructDeclarations(tree);

  const findStructNameAtLine = (line: number): string => {
    for (const struct of structs) {
      if (line >= struct.node.startPosition.line && line <= struct.node.endPosition.line) {
        return struct.name;
      }
    }
    return "";
  };

  for (const struct of structs) {
    const classBody = struct.node.children.find((c) => c.type === "class_body");
    if (!classBody) {
      continue;
    }

    for (const child of classBody.children) {
      if (child.type !== "public_field_definition") {
        continue;
      }

      const fieldName = child.children.find((c) => c.type === "property_identifier")?.text ?? "";
      const decoNames = getDecoratorNamesForField(child);

      for (const decoName of decoNames) {
        // Find the decorator node for position info
        const decoNode = findDecoratorNodeByName(child, decoName);
        results.push({
          decoratorName: decoName,
          fieldName,
          structName: struct.name,
          line: decoNode?.startPosition.line ?? child.startPosition.line,
          node: decoNode ?? child,
        });
      }
    }
  }

  return results;
}

function getDecoratorNamesForField(fieldNode: ArkTSNode): string[] {
  const names: string[] = [];
  for (const child of fieldNode.children) {
    if (child.type === "decorator") {
      const name = getDecoratorCallName(child);
      if (name) {
        names.push(name);
      }
    }
    // ERROR recovery: decorator inside ERROR child
    if (child.type === "ERROR") {
      for (const errChild of child.children) {
        if (errChild.type === "decorator") {
          const name = getDecoratorCallName(errChild);
          if (name) {
            names.push(name);
          }
        }
      }
    }
  }
  return names;
}

function getDecoratorCallName(deco: ArkTSNode): string | null {
  const directId = deco.children.find((c) => c.type === "identifier");
  if (directId) {
    return directId.text;
  }
  const callExpr = deco.children.find((c) => c.type === "call_expression");
  if (callExpr) {
    return callExpr.children.find((c) => c.type === "identifier")?.text ?? null;
  }
  return null;
}

function findDecoratorNodeByName(fieldNode: ArkTSNode, name: string): ArkTSNode | null {
  for (const child of fieldNode.children) {
    if (child.type === "decorator" && getDecoratorCallName(child) === name) {
      return child;
    }
    if (child.type === "ERROR") {
      for (const errChild of child.children) {
        if (errChild.type === "decorator" && getDecoratorCallName(errChild) === name) {
          return errChild;
        }
      }
    }
  }
  return null;
}

// ─── V1/V2 Mixing Validation ───────────────────────────────────────────────

export function validateV1V2Mixing(
  tree: ArkTSTree,
  diagnostics: Diagnostic[],
  maxProblems: number,
): void {
  const v2Info = getV2ComponentInfo(tree);
  const v2StructNames = new Set(v2Info.filter((s) => s.isV2).map((s) => s.name));

  const fieldDecorators = collectFieldDecorators(tree);

  for (const entry of fieldDecorators) {
    if (diagnostics.length >= maxProblems) {
      break;
    }

    const isV2Struct = v2StructNames.has(entry.structName);
    const isV1Deco = V1_FIELD_DECORATORS.has(entry.decoratorName);
    const isV2Deco = V2_FIELD_DECORATORS.has(entry.decoratorName);

    if (isV2Struct && isV1Deco) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: entry.node.startPosition,
          end: entry.node.endPosition,
        },
        message: `@${entry.decoratorName} is a V1 decorator and cannot be used in @ComponentV2 struct \`${entry.structName}\`. Use a V2 equivalent instead.`,
        source: "arkts-lsp",
      });
    } else if (!isV2Struct && isV2Deco) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: entry.node.startPosition,
          end: entry.node.endPosition,
        },
        message: `@${entry.decoratorName} is a V2 decorator and cannot be used in V1 @Component struct \`${entry.structName}\`. Use a V1 equivalent instead.`,
        source: "arkts-lsp",
      });
    }
  }
}

// ─── @Param/@Event Scope Validation ────────────────────────────────────────

export function validateV2OnlyDecoratorScope(
  tree: ArkTSTree,
  diagnostics: Diagnostic[],
  maxProblems: number,
): void {
  const v2Info = getV2ComponentInfo(tree);
  const v2StructNames = new Set(v2Info.filter((s) => s.isV2).map((s) => s.name));

  const fieldDecorators = collectFieldDecorators(tree);

  for (const entry of fieldDecorators) {
    if (diagnostics.length >= maxProblems) {
      break;
    }

    if (!V2_ONLY_DECORATORS.has(entry.decoratorName)) {
      continue;
    }

    if (!v2StructNames.has(entry.structName)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: entry.node.startPosition,
          end: entry.node.endPosition,
        },
        message: `@${entry.decoratorName} can only be used in @ComponentV2 structs, not in \`${entry.structName}\`.`,
        source: "arkts-lsp",
      });
    }
  }
}

// ─── @Computed Getter Validation ───────────────────────────────────────────

export function validateComputedGetter(
  tree: ArkTSTree,
  diagnostics: Diagnostic[],
  maxProblems: number,
): void {
  const computedMethods = getComputedMethods(tree);

  for (const method of computedMethods) {
    if (diagnostics.length >= maxProblems) {
      break;
    }

    if (!method.isGetter) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: method.node.startPosition,
          end: method.node.endPosition,
        },
        message: `@Computed method \`${method.name}\` should be a getter. Use \`get ${method.name}()\` instead of \`${method.name}()\`.`,
        source: "arkts-lsp",
      });
    }
  }
}

// ─── @Trace Scope Validation ───────────────────────────────────────────────

export function validateTraceScope(
  tree: ArkTSTree,
  diagnostics: Diagnostic[],
  maxProblems: number,
): void {
  const observedClasses = getObservedV2Classes(tree);
  const observedClassRanges = observedClasses.map((cls) => ({
    start: cls.node.startPosition.line,
    end: cls.node.endPosition.line,
  }));

  const fieldDecorators = collectFieldDecorators(tree);

  for (const entry of fieldDecorators) {
    if (diagnostics.length >= maxProblems) {
      break;
    }

    if (entry.decoratorName !== "Trace") {
      continue;
    }

    // Check if this @Trace field is inside an @ObservedV2 class
    const isInObservedClass = observedClassRanges.some(
      (cls) => entry.line >= cls.start && entry.line <= cls.end,
    );

    if (!isInObservedClass) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: {
          start: entry.node.startPosition,
          end: entry.node.endPosition,
        },
        message: `@Trace can only be used inside @ObservedV2 classes, not in \`${entry.structName}\`. Wrap the data class with @ObservedV2 instead.`,
        source: "arkts-lsp",
      });
    }
  }
}
