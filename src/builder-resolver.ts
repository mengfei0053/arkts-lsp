import { TextDocument } from "vscode-languageserver-textdocument";
import { collectImportBindings } from "./text.js";
import { getBuilderFunctions, parseArkTS } from "./parser.js";
import { type ModuleResolver } from "./component-resolver.js";
import { resolveRelativeModule } from "./project.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ImportedBuilder = {
  /** The local name used in the importing file (alias if `as` was used) */
  localName: string;
  /** The original exported name in the source file */
  importedName: string;
  /** The struct name the @Builder belongs to (empty string if global @Builder function) */
  structName: string;
  /** Whether the builder is a global @Builder function (not inside a struct) */
  isGlobal: boolean;
  /** The URI of the target document containing the builder definition */
  targetUri: string;
  /** The line number of the builder definition in the target file */
  targetLine: number;
  /** Parameter names extracted from the builder signature */
  parameters: string[];
};

// ─── Main Resolver ─────────────────────────────────────────────────────────

/**
 * Resolve all imported @Builder functions for a given document.
 * Collects import bindings → resolves specifier → checks if imported name
 * is a @Builder function in the target document.
 */
export function resolveImportedBuilders(
  document: TextDocument,
  projectDocuments: TextDocument[],
  resolveModule: ModuleResolver = resolveRelativeModule as ModuleResolver,
): ImportedBuilder[] {
  const results: ImportedBuilder[] = [];
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

    const builder = findBuilderInDocument(targetDoc, binding.importedName);
    if (!builder) {
      continue;
    }

    results.push({
      localName: binding.localName,
      importedName: binding.importedName,
      structName: builder.structName,
      isGlobal: builder.isGlobal,
      targetUri: targetDoc.uri,
      targetLine: builder.line,
      parameters: builder.parameters,
    });
  }

  return results;
}

/**
 * Find a specific @Builder function by name in a document.
 */
function findBuilderInDocument(
  document: TextDocument,
  name: string,
): { name: string; structName: string; isGlobal: boolean; line: number; parameters: string[] } | null {
  const tree = parseArkTS(document);
  if (!tree) {
    return null;
  }

  const builders = getBuilderFunctions(tree);
  const target = builders.find((b) => b.name === name);

  if (!target) {
    return null;
  }

  // Extract parameter names from the builder's formal_parameters
  const parameters = extractBuilderParameters(target.node);

  return {
    name: target.name,
    structName: target.structName ?? "",
    isGlobal: !target.structName, // global if not inside a struct
    line: target.line,
    parameters,
  };
}

/**
 * Extract parameter names from a builder function's formal_parameters node.
 */
function extractBuilderParameters(node: import("./parser.js").ArkTSNode): string[] {
  const params: string[] = [];
  const formalParams = node.children.find((c) => c.type === "formal_parameters");
  if (!formalParams) {
    return params;
  }

  for (const child of formalParams.children) {
    // required_parameter / optional_parameter / rest_parameter
    if (child.type === "required_parameter" || child.type === "optional_parameter") {
      const ident = child.children.find((c) =>
        c.type === "identifier" || c.type === "property_identifier",
      );
      if (ident) {
        params.push(ident.text);
      }
    }
    // shorthand: identifier directly in formal_parameters
    if (child.type === "identifier") {
      params.push(child.text);
    }
  }

  return params;
}

/**
 * Lookup an imported builder by local name.
 */
export function lookupImportedBuilder(
  localName: string,
  importedBuilders: ImportedBuilder[],
): ImportedBuilder | undefined {
  return importedBuilders.find((b) => b.localName === localName);
}
