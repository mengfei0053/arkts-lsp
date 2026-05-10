import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { findNodesByType, getBuildMethodComponentTree, getStructDeclarations, parseArkTS } from "./parser.js";
import { getComponentProps } from "./component-props.js";
import { resolveImportedComponents, type ModuleResolver } from "./component-resolver.js";
import { resolveRelativeModule } from "./project.js";

// ─── Built-in components (skip validation) ─────────────────────────────────

const BUILTIN_COMPONENTS = new Set([
  "Text", "Row", "Column", "Button", "Image", "List", "ForEach",
  "If", "Else", "Blank", "Scroll", "Stack", "Grid", "Flex",
  "Tabs", "TabContent", "Swiper", "TextInput", "TextArea", "Slider",
  "Toggle", "Checkbox", "Radio", "Progress", "Divider", "Marquee",
]);

// ─── Main ───────────────────────────────────────────────────────────────────

/**
 * Validate component call props:
 * 1. Unknown prop: prop name not in component's props list → Warning
 * 2. Missing required prop: @Link/@Param without default, not passed → Hint
 */
export function validateComponentCallProps(
  document: TextDocument,
  projectDocuments: TextDocument[],
  diagnostics: Diagnostic[],
  maxProblems: number,
  resolveModule: ModuleResolver = resolveRelativeModule,
): void {
  const tree = parseArkTS(document);
  if (!tree) {
    return;
  }

  const structs = getStructDeclarations(tree);
  const importedComponents = resolveImportedComponents(document, projectDocuments, resolveModule);

  // For each struct that has a build method, check component calls
  for (const struct of structs) {
    if (diagnostics.length >= maxProblems) {
      break;
    }

    const componentTree = getBuildMethodComponentTree(tree, struct.name);
    if (componentTree.length === 0) {
      continue;
    }

    // Find component_statement nodes inside build() (ArkTS component calls use component_statement, not call_expression)
    const componentStatements = findNodesByType(tree, "component_statement");
    for (const compStmt of componentStatements) {
      if (diagnostics.length >= maxProblems) {
        break;
      }

      // Must be within this struct's build method
      if (compStmt.startPosition.line < struct.node.startPosition.line ||
          compStmt.startPosition.line > struct.node.endPosition.line) {
        continue;
      }

      // Get component name — first identifier child
      const nameNode = compStmt.children.find((c) =>
        c.type === "identifier" || c.type === "type_identifier",
      );
      if (!nameNode) {
        continue;
      }
      const componentName = nameNode.text;

      // Skip built-in components
      if (BUILTIN_COMPONENTS.has(componentName)) {
        continue;
      }

      // Find the arguments → object child (props passed to component)
      const argumentsNode = compStmt.children.find((c) => c.type === "arguments");
      const objectArg = argumentsNode?.children.find((c) => c.type === "object");
      if (!objectArg) {
        // No props passed — check for missing required props
        checkMissingRequiredProps(
          componentName, null, document, projectDocuments,
          importedComponents, diagnostics, maxProblems,
        );
        continue;
      }

      // Extract passed prop names from object
      const passedProps = extractPassedPropNames(objectArg);

      // Get component's declared props
      const componentProps = resolveComponentProps(
        componentName, document, projectDocuments, importedComponents,
      );

      if (componentProps.length === 0) {
        // Unknown component — skip
        continue;
      }

      const propNames = new Set(componentProps.map((p) => p.name));

      // Check for unknown props
      for (const passed of passedProps) {
        if (diagnostics.length >= maxProblems) {
          break;
        }
        if (!propNames.has(passed.name)) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
              start: passed.position,
              end: { line: passed.position.line, character: passed.position.character + passed.name.length },
            },
            message: `Unknown prop \`${passed.name}\` passed to \`${componentName}\`. Available props: ${componentProps.map((p) => p.name).join(", ")}`,
            source: "arkts-lsp",
          });
        }
      }

      // Check for missing required props
      checkMissingRequiredProps(
        componentName, new Set(passedProps.map((p) => p.name)),
        document, projectDocuments, importedComponents, diagnostics, maxProblems,
      );
    }
  }
}

// ─── Internal ───────────────────────────────────────────────────────────────

type PassedProp = { name: string; position: { line: number; character: number } };

function extractPassedPropNames(objectNode: import("./parser.js").ArkTSNode): PassedProp[] {
  const props: PassedProp[] = [];

  for (const child of objectNode.children) {
    // Normal: pair node (key: value)
    if (child.type === "pair") {
      const key = child.children.find((c) =>
        c.type === "property_identifier" || c.type === "identifier",
      );
      if (key) {
        props.push({
          name: key.text,
          position: key.startPosition,
        });
      }
    }

    // Shorthand: identifier used as both key and value
    if (child.type === "identifier" || child.type === "shorthand_property_identifier") {
      props.push({
        name: child.text,
        position: child.startPosition,
      });
    }

    // ERROR recovery: try to extract from text
    if (child.type === "ERROR") {
      const match = /^(\w+)\s*:/u.exec(child.text);
      if (match) {
        props.push({
          name: match[1],
          position: child.startPosition,
        });
      }
    }
  }

  return props;
}

function resolveComponentProps(
  componentName: string,
  document: TextDocument,
  projectDocuments: TextDocument[],
  importedComponents: ReturnType<typeof resolveImportedComponents>,
): ReturnType<typeof getComponentProps> {
  // Check imported components first
  const imported = importedComponents.find((c) => c.localName === componentName);
  if (imported) {
    const targetDoc = projectDocuments.find((d) => d.uri === imported.targetUri);
    if (targetDoc) {
      return getComponentProps(targetDoc, imported.structName);
    }
  }

  // Local component
  return getComponentProps(document, componentName);
}

function checkMissingRequiredProps(
  componentName: string,
  passedPropNames: Set<string> | null,
  document: TextDocument,
  projectDocuments: TextDocument[],
  importedComponents: ReturnType<typeof resolveImportedComponents>,
  diagnostics: Diagnostic[],
  maxProblems: number,
): void {
  const componentProps = resolveComponentProps(
    componentName, document, projectDocuments, importedComponents,
  );

  if (componentProps.length === 0) {
    return;
  }

  const passed = passedPropNames ?? new Set<string>();

  for (const prop of componentProps) {
    if (diagnostics.length >= maxProblems) {
      break;
    }

    // Required = no default value (e.g., @Link, @Param without =)
    if (!prop.hasDefault && !passed.has(prop.name)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Hint,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        message: `Required prop \`${prop.name}\` (@${prop.decorator}) not passed to \`${componentName}\`.`,
        source: "arkts-lsp",
      });
    }
  }
}
