# AGENTS.md

## Scope

This file applies to everything under `src/`.

## Purpose

- Keep runtime server code easy to read, test, and extend.
- Separate transport-layer LSP handlers from reusable analysis logic.
- Keep ArkTS-specific semantics lightweight and localized, especially around component fields, hover, completion, and navigation.

## Current Focus

- P0-P3 phase completed. All V1 (13) and V2 (10) decorators have parser/hover/diagnostics support.
- V2 constraint diagnostics: V1/V2 mixing, @Param/@Event scope, @Computed getter, @Trace scope.
- Component tree semantics with @Builder/@BuilderParam slot-like children and ERROR recovery.
- Cross-file component resolution, props extraction, and call-site props diagnostics.
- Cross-file @Builder tracking (global functions + struct methods) with navigation/hover.
- Incremental re-parsing via tree-sitter edit API and raw Tree caching.
- Workspace symbol index with startup pre-indexing and lifecycle integration.
- CodeLens provider and parse cache optimizations.
- Type system: type-model.ts (union/intersection/array/generic/nullable parsing), type-hover.ts (AST-driven type info on hover), type-inlay.ts (inferred type hints for untyped variables).
- SignatureHelp: supports `this.field.method()` chain calls (resolveThisFieldType) + instance methods (not just static).
- Type Hierarchy: supports both struct and class declarations (getClassDeclarations).

## Implementation Guidelines

- Put protocol wiring and connection lifecycle code in `index.ts` or a dedicated server entry module.
- Put reusable parsing, symbol, diagnostic, and navigation helpers in focused modules re-exported by `core.ts`.
- Prefer pure functions for logic that can be tested without starting an LSP process.
- Keep ArkTS-specific behavior explicit and documented in code or tests.
- Keep each `.ts` file at 400 lines or fewer; split by responsibility before crossing that boundary.

## Change Expectations

- If a feature adds a new analysis capability, expose it through a reusable function first when reasonable.
- If a change alters behavior, add or update tests in `test/`.
- When a task changes user-visible behavior or workflow, update `README.md` and the nearest relevant `AGENTS.md` in the same change whenever practical.
- Update this file when the source layout or implementation conventions materially change.

## Current Boundaries

- `index.ts`: LSP connection setup and request/notification registration
- `core.ts`: lightweight barrel that re-exports analysis modules
- `types.ts`: shared analysis types
- `diagnostics.ts`: basic diagnostic rules
- `text.ts`: word lookup, import parsing, member/call context parsing, and small text utilities
- `symbols.ts`: symbol extraction, export discovery, and symbol presentation helpers
- `navigation.ts`: definition, references, document links, highlights, and rename flows
- `completion.ts`: keyword, import, and class member completion helpers
- `hover.ts`: base hover and import/export-aware hover
- `inlay-hint.ts`: text-based inlay hint collection for lightweight parameter labels
- `code-action.ts`: text-based quick fixes derived from existing diagnostics
- `semantic-tokens.ts`: text-based semantic token collection and encoding
- `signature.ts`: signature help parsing and resolution (instance + static methods, `this.field.method()` chain calls)
- `call-hierarchy.ts`: Call Hierarchy (prepareCallHierarchy + incomingCalls + outgoingCalls) via tree-sitter AST
- `type-hierarchy.ts`: Type Hierarchy (struct + class support, supertypes + subtypes)
- `project.ts`: ArkTS/HarmonyOS project root detection, source file discovery, project document loading, and relative module resolution
- `selection-range.ts`: text-based nested selection ranges for identifiers, statements, and brace blocks
- `observed-links.ts`: @Observed→@ObjectLink reactive observation chain tracking
- `v2-diagnostics.ts`: V2 decorator constraint validation (V1/V2 mixing, @Param/@Event scope, @Computed getter, @Trace scope) with ERROR-recovery-aware decorator extraction
- `component-resolver.ts`: cross-file component resolution from import bindings (resolveImportedComponents, lookupImportedComponent, collectAvailableComponentNames)
- `component-props.ts`: component props extraction (@Prop/@Link/@Param/@Event) with default-value detection
- `codelens.ts`: CodeLens provider for component overview labels above struct declarations
- `prop-diagnostics.ts`: component call-site props diagnostics (unknown prop Warning, missing required prop Hint)
- `builder-resolver.ts`: cross-file @Builder function resolution (global functions + struct methods) with parameter extraction
- `workspace-indexer.ts`: document-level symbol index with startup pre-indexing and lifecycle-driven incremental updates
