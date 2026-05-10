import { TextDocument } from "vscode-languageserver-textdocument";
import { collectImportBindings } from "./text.js";
import { getStructDeclarations, getV2ComponentInfo, parseArkTS } from "./parser.js";
import { resolveRelativeModule } from "./project.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ImportedComponent = {
  /** The local name used in the importing file (alias if `as` was used) */
  localName: string;
  /** The original exported name in the source file */
  importedName: string;
  /** The struct name in the target file (same as importedName unless re-exported) */
  structName: string;
  /** Whether the component is V2 (@ComponentV2) */
  isV2: boolean;
  /** The struct decorators */
  decorators: string[];
  /** The URI of the target document containing the component definition */
  targetUri: string;
  /** The line number of the struct declaration in the target file */
  targetLine: number;
};

export type ModuleResolver = (
  fromUri: string,
  specifier: string,
  documents: TextDocument[],
) => TextDocument | null;

// ─── Main Resolver ─────────────────────────────────────────────────────────

/**
 * Resolve all imported component structs for a given document.
 * Collects import bindings → resolves specifier → checks if imported name
 * is a @Component/@ComponentV2 struct in the target document.
 */
export function resolveImportedComponents(
  document: TextDocument,
  projectDocuments: TextDocument[],
  resolveModule: ModuleResolver = resolveRelativeModule,
): ImportedComponent[] {
  const results: ImportedComponent[] = [];
  const bindings = collectImportBindings(document);

  for (const binding of bindings) {
    const targetDoc = resolveModule(
      document.uri,
      binding.specifier,
      projectDocuments,
    );

    if (!targetDoc) {
      continue;
    }

    const component = findComponentInDocument(targetDoc, binding.importedName);
    if (!component) {
      continue;
    }

    results.push({
      localName: binding.localName,
      importedName: binding.importedName,
      structName: component.name,
      isV2: component.isV2,
      decorators: component.decorators,
      targetUri: targetDoc.uri,
      targetLine: component.line,
    });
  }

  return results;
}

/**
 * Find a specific @Component/@ComponentV2 struct by name in a document.
 */
function findComponentInDocument(
  document: TextDocument,
  name: string,
): { name: string; isV2: boolean; decorators: string[]; line: number } | null {
  const tree = parseArkTS(document);
  if (!tree) {
    return null;
  }

  const structs = getStructDeclarations(tree);
  const v2Info = getV2ComponentInfo(tree);
  const v2Names = new Set(v2Info.filter((s) => s.isV2).map((s) => s.name));

  const target = structs.find((s) => s.name === name);
  if (!target) {
    return null;
  }

  // Only return if it's a component (has @Component or @ComponentV2)
  if (!target.decorators.includes("Component") && !target.decorators.includes("ComponentV2")) {
    return null;
  }

  return {
    name: target.name,
    isV2: v2Names.has(target.name),
    decorators: target.decorators,
    line: target.line,
  };
}

/**
 * Lookup an imported component by local name.
 * Useful when resolving a component usage in build() back to its definition.
 */
export function lookupImportedComponent(
  localName: string,
  importedComponents: ImportedComponent[],
): ImportedComponent | undefined {
  return importedComponents.find((c) => c.localName === localName);
}

/**
 * Collect all component names available in a document's scope.
 * Combines locally-defined components with imported ones.
 */
export function collectAvailableComponentNames(
  document: TextDocument,
  projectDocuments: TextDocument[],
  resolveModule: ModuleResolver = resolveRelativeModule,
): Array<{ name: string; source: "local" | "imported"; isV2: boolean; targetUri?: string }> {
  const result: Array<{ name: string; source: "local" | "imported"; isV2: boolean; targetUri?: string }> = [];

  // Local components
  const tree = parseArkTS(document);
  if (tree) {
    const structs = getStructDeclarations(tree);
    const v2Info = getV2ComponentInfo(tree);
    const v2Names = new Set(v2Info.filter((s) => s.isV2).map((s) => s.name));

    for (const struct of structs) {
      if (struct.decorators.includes("Component") || struct.decorators.includes("ComponentV2")) {
        result.push({
          name: struct.name,
          source: "local",
          isV2: v2Names.has(struct.name),
        });
      }
    }
  }

  // Imported components
  const imported = resolveImportedComponents(document, projectDocuments, resolveModule);
  for (const comp of imported) {
    result.push({
      name: comp.localName,
      source: "imported",
      isV2: comp.isV2,
      targetUri: comp.targetUri,
    });
  }

  return result;
}
