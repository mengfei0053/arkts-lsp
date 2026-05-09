# TODO — ArkTS LSP Roadmap

> This file tracks the gap between the current MVP and the final goal: a stable, project-aware ArkTS LSP that `opencode` can launch automatically for real HarmonyOS projects.

## ✅ Already Implemented

These capabilities are working and covered by tests:

- **Text synchronization**: incremental `didOpen` / `didChange` / `didClose`
- **Diagnostics**: TODO and `any` markers
- **Hover**: basic symbol info + import/export-aware descriptions
- **Symbol extraction**: regex-based ArkTS/TypeScript declaration parsing
- **Document & workspace symbols**: filtering and search
- **Definition**: symbol-name based + import/export-aware + relative import path jumps
- **References**: import/export-aware lookup
- **Rename**: workspace edit generation
- **Completion**: keywords, workspace symbols, named-import exports, `this.` instance members, imported class static members
- **Signature help**: imported functions and class methods
- **Inlay hints**: parameter names for local functions and imported aliases
- **Code actions**: quick fixes for TODO / `any` diagnostics
- **Semantic tokens**: keywords, types, functions, variables, decorators, properties
- **Import path resolution**: relative path completion + DocumentLink (clickable)
- **Document highlight**: exact-word identifier highlighting
- **Folding range**: multi-line brace blocks
- **Selection range**: identifiers, statements, brace blocks
- **Project context**: root detection, `.ets`/`.ts` scanning, project-level loading
- **opencode integration**: global/project config examples + launcher script

## 🟡 Partially Implemented / Needs Improvement

These exist at a text-heuristic level and should be upgraded to project-aware behavior:

| Area | Current State | Target State |
|------|--------------|--------------|
| **Definition** | Regex + symbol-name matching; handles relative imports | AST/project-level resolution, cross-module navigation |
| **References** | Text-level search with import/export awareness | True reference graph across the project |
| **Rename** | Text replacement with import/export awareness | Safe rename with scope analysis, collision detection |
| **Completion** | Regex + workspace index + named-import exports | AST-aware completion, context-sensitive suggestions |
| **Diagnostics** | Simple TODO / `any` pattern matching | ArkTS-specific linting (type errors, decorator misuse, etc.) |
| **Semantic tokens** | Token + regex-based classification | Type-checker driven token types and modifiers |
| **Hover** | Symbol info from extracted declarations | Type signatures, JSDoc, decorator metadata |
| **Inlay hints** | Local function parameters | Type inference hints, implicit return types, chained call params |

## 🔴 Not Yet Implemented

These are planned but not started:

### ArkTS-Specific Features
- [ ] **Tree-sitter or lightweight ArkTS parser integration** — replace regex-based symbol extraction with real parsing
- [ ] **`@Builder` / `@BuilderParam` support** — hover, completion, navigation for builder functions
- [ ] **`@Provide` / `@Consume` / `@Observed` / `@ObjectLink` decorators** — state management field semantics
- [ ] **`build()` method analysis** — UI component tree awareness
- [ ] **ArkTS type system awareness** — union types, optional chaining, type guards
- [ ] **HarmonyOS API surface knowledge** — built-in module completion and hover for `@kit` imports
- [ ] **ETS module resolution** — resolve `import { x } from '@kit.*'` and `import { x } from '@ohos.*'`

### LSP Protocol Extensions
- [ ] **Document symbols with hierarchy** — tree-structured outline view (current: flat list)
- [ ] **Call hierarchy** — `callHierarchy/prepare` and `callHierarchy/incomingCalls` / `outgoingCalls`
- [ ] **Type hierarchy** — `typeHierarchy/prepare` and subtype/supertype navigation
- [ ] **Code lens** — run/debug actions, test counts, decorator metadata
- [ ] **Inlay hints (expanded)** — implicit type annotations, chain expression parameter names
- [ ] **Linked editing ranges** — paired tag/attribute editing for ArkTS UI syntax
- [ ] **Moniker** — cross-reference symbol identity for indexing services

### Project & Tooling
- [ ] **Incremental parsing** — avoid full re-parse on every `didChange`
- [ ] **Watch service** — file system watcher for cross-file updates
- [ ] **Configuration support** — `workspace/configuration` for user-tunable settings
- [ ] **Progress reporting** — `$/progress` for long operations (initial scan, re-index)
- [ ] **Real-project integration tests** — fixture from an actual HarmonyOS app, end-to-end LSP protocol tests
- [ ] **Performance benchmarks** — measure startup time, memory usage, response latency on large projects

## 🎯 Final Goal

When complete, `opencode` (or any LSP client) should be able to:

1. Launch `arkts-lsp` automatically for `.ets` files
2. Provide project-aware navigation, completion, and diagnostics
3. Understand ArkTS/HarmonyOS project structure, decorators, and API surface
4. Enable AI code generation tools to use LSP context for better ArkTS code
