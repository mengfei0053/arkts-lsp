# AGENTS.md

## Scope

This file applies to the whole repository unless a deeper `AGENTS.md` overrides it.

## Project Mission

- Build a lightweight, testable ArkTS language server.
- Prefer small, reviewable milestones over large speculative rewrites.
- Keep the project runnable with `npm install`, `npm run build`, `npm run check`, and `npm test`.
- Keep the current MVP-first architecture: text-based heuristics first, deeper semantics only when they clearly improve editor usefulness.

## Current Focus

- P0-P5 completed (23/23). Core LSP capabilities are stable — 31/31 LSP features verified end-to-end.
- 25 ArkTS decorators fully supported across parser/hover/diagnostics layers (V1: 13, V2: 10 + @Monitor/@Provider/@Consumer key matching).
- V1/V2 decorator mixing diagnostics, @Param/@Event scope, @Computed getter, @Trace scope constraints.
- Component tree semantics with @Builder/@BuilderParam slot-like modeling and ERROR recovery.
- Cross-file component resolution, component props extraction, and component call props diagnostics (unknown/missing required props).
- Cross-file @Builder function tracking (global + struct-member) with definition navigation and hover info.
- Incremental re-parsing via tree-sitter edit API (applyDocumentEdit + parseArkTSIncremental).
- Workspace symbol index with startup pre-indexing and lifecycle-driven updates.
- CodeLens provider for component overviews above struct declarations.
- Parse cache with (uri, version, contentHash) keying and raw Tree retention.
- P4: Hierarchical Document Symbols, Call Hierarchy (incoming/outgoing), Type Hierarchy (supertypes/subtypes, struct + class).
- P5: Type system awareness (type-model.ts), type-aware hover, extended inlay hints with inferred types, SignatureHelp for this.field.method().
- Integration: full-feature coverage matrix (31/31), HarmonyOS test-fixture project with opencode LSP config.

## Agent Workflow

- For coding tasks, prefer delegating implementation work through OpenCode when available and appropriate.
- Follow a test-first approach for behavior changes: add or update tests before or alongside implementation.
- After code changes, run targeted tests first, then `npm test`, then `npm run build`.
- When a task changes user-visible behavior or workflow, update `README.md` and the nearest relevant `AGENTS.md` in the same change whenever practical.

## Working Rules

- Preserve the current MVP-first approach.
- Favor extracting pure functions into focused modules before adding new protocol handlers.
- Add or update tests for behavior changes whenever practical.
- Update the nearest relevant `AGENTS.md` when directory responsibilities, conventions, or workflows change.
- Keep `.ts` source and test files at 400 lines or fewer. If a file starts pushing past that limit, split it before adding more behavior.

## Code Style

- Use TypeScript with strict typing.
- Prefer small functions with explicit inputs and outputs.
- Keep LSP wiring thin and move reusable logic into `src/core.ts` or similar modules.
- Prefer adding focused modules over growing existing large files.
- Avoid adding heavy dependencies unless they unlock clear ArkTS or LSP value.

## Validation

- Run `npm run build`
- Run `npm run check`
- Run `npm test`

## Directory Map

- `src/`: language server runtime and reusable analysis helpers
- `test/`: unit and integration coverage for server behavior
- `scripts/`: local wrapper scripts, LSP integration test (`integration-test.cjs`), and feature coverage matrix (`coverage-matrix.cjs`)
- `examples/`: sample configuration files for external integrations such as opencode
- `test-fixture/`: HarmonyOS project fixture for end-to-end LSP testing (9 source files + build config)
