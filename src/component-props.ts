import { TextDocument } from "vscode-languageserver-textdocument";
import { findNodesByType, getDecoratorNames, getStructDeclarations, getV2ComponentInfo, parseArkTS } from "./parser.js";
import { collectFieldDecorators } from "./v2-diagnostics.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ComponentPropInfo = {
  /** Field name */
  name: string;
  /** Decorator name (Prop, Link, Param, Event, etc.) */
  decorator: string;
  /** Type annotation (best-effort extraction) */
  type: string;
  /** Whether the field has a default value */
  hasDefault: boolean;
  /** Whether this is a V2 component prop */
  isV2: boolean;
};

/** V1 prop decorators — explicit external API of a V1 component */
const V1_PROP_DECORATORS = new Set(["Prop", "Link"]);

/** V2 prop decorators — explicit external API of a V2 component */
const V2_PROP_DECORATORS = new Set(["Param", "Event"]);

// ─── Main ───────────────────────────────────────────────────────────────────

/**
 * Extract props (external API fields) from a component struct.
 * V1: @Prop, @Link, @Provide, @Consume
 * V2: @Param, @Event, @Provider, @Consumer
 */
export function getComponentProps(document: TextDocument, structName: string): ComponentPropInfo[] {
  const tree = parseArkTS(document);
  if (!tree) {
    return [];
  }

  const structs = getStructDeclarations(tree);
  const v2Info = getV2ComponentInfo(tree);
  const v2Names = new Set(v2Info.filter((s) => s.isV2).map((s) => s.name));

  const targetStruct = structs.find((s) => s.name === structName);
  if (!targetStruct) {
    return [];
  }

  // Only extract props from component structs
  if (!targetStruct.decorators.includes("Component") && !targetStruct.decorators.includes("ComponentV2")) {
    return [];
  }

  const isV2 = v2Names.has(structName);
  const propDecorators = isV2 ? V2_PROP_DECORATORS : V1_PROP_DECORATORS;
  const props: ComponentPropInfo[] = [];

  // Walk the struct body to find decorated fields
  const structNode = findStructNode(tree, structName);
  if (structNode) {
    const body = structNode.children.find((c) => c.type === "class_body" || c.type === "object");
    if (body) {
      props.push(...extractPropsFromBody(body, isV2, propDecorators));
    }
  }

  // Fallback: use ERROR-recovery-aware field decorator extraction
  if (props.length === 0) {
    const fieldEntries = collectFieldDecorators(tree);
    for (const entry of fieldEntries) {
      if (entry.structName !== structName) {
        continue;
      }
      if (!propDecorators.has(entry.decoratorName)) {
        continue;
      }
      // Extract type and default from the node text
      const declText = entry.node.text;
      props.push({
        name: entry.fieldName,
        decorator: entry.decoratorName,
        type: extractTypeFromDeclaration(declText),
        hasDefault: declText.includes("="),
        isV2,
      });
    }
  }

  return props;
}

// ─── Internal ───────────────────────────────────────────────────────────────

function findStructNode(tree: import("./parser.js").ArkTSTree, structName: string): import("./parser.js").ArkTSNode | null {
  const declarations = findNodesByType(tree, "struct_declaration");
  for (const decl of declarations) {
    const nameNode = decl.children.find((c) => c.type === "type_identifier" || c.type === "identifier");
    if (nameNode?.text === structName) {
      return decl;
    }
  }
  return null;
}

function extractPropsFromBody(
  body: import("./parser.js").ArkTSNode,
  isV2: boolean,
  propDecorators: Set<string>,
): ComponentPropInfo[] {
  const props: ComponentPropInfo[] = [];

  for (const child of body.children) {
    // Normal path: public_field_definition with decorator children
    if (child.type === "public_field_definition" || child.type === "field_definition") {
      const decorators = getDecoratorNames(child);
      const propDeco = decorators.find((d) => propDecorators.has(d));
      if (!propDeco) {
        continue;
      }

      const name = child.children.find((c) => c.type === "property_identifier")?.text ?? "";
      const type = extractTypeFromNode(child);
      const hasDefault = child.text.includes("=");

      props.push({ name, decorator: propDeco, type, hasDefault, isV2 });
    }

    // ERROR recovery: check ERROR nodes that may contain decorated fields
    if (child.type === "ERROR") {
      const errorProps = extractPropsFromErrorNode(child, isV2, propDecorators);
      props.push(...errorProps);
    }
  }

  return props;
}

function extractPropsFromErrorNode(
  errorNode: import("./parser.js").ArkTSNode,
  isV2: boolean,
  propDecorators: Set<string>,
): ComponentPropInfo[] {
  const props: ComponentPropInfo[] = [];
  const source = errorNode.text;

  // Pattern: @Decorator fieldName: Type or @Decorator fieldName: Type = default
  const fieldPattern = /@(\w+)\s+(\w+)\s*:\s*([^=\n]+?)(\s*=\s*)?/gu;
  let match: RegExpExecArray | null;
  while ((match = fieldPattern.exec(source)) !== null) {
    const decorator = match[1];
    const name = match[2];
    const type = match[3].trim();
    const hasDefault = match[4] !== undefined;

    if (propDecorators.has(decorator)) {
      props.push({ name, decorator, type, hasDefault, isV2 });
    }
  }

  return props;
}

function extractTypeFromNode(node: import("./parser.js").ArkTSNode): string {
  // Look for type_annotation child
  const typeAnnotation = node.children.find((c) => c.type === "type_annotation");
  if (typeAnnotation) {
    // Skip the ":" token, get the rest
    const parts = typeAnnotation.children.filter((c) => c.type !== ":");
    return parts.map((c) => c.text).join("").trim();
  }
  return "";
}

function extractTypeFromDeclaration(declaration: string): string {
  const match = /:\s*([^=\n]+)/u.exec(declaration);
  return match ? match[1].trim() : "";
}
