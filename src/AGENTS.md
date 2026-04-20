# AGENTS.md

## Scope

This file applies to everything under `src/`.

## Purpose

- Keep runtime server code easy to read, test, and extend.
- Separate transport-layer LSP handlers from reusable analysis logic.
- Keep ArkTS-specific semantics lightweight and localized, especially around component fields, hover, completion, and navigation.

## Current Focus

- `@State`, `@Prop`, and `@Link` field handling inside ArkTS components.
- `this.` instance-member completion inside component bodies.
- Lightweight structural selection support that stays text-based and predictable.
- Lightweight inlay hints that reuse existing symbol/signature heuristics.
- Lightweight code actions that reuse existing diagnostics and stay text-based.
- Lightweight semantic tokens that stay text-based and reuse declaration/context heuristics.
- Hover, definition, references, rename, and document-link flows that stay aligned with the symbol model.
- Preserve import/export and linked-reference behavior while refining the heuristics incrementally.

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
- `signature.ts`: signature help parsing and resolution
- `project.ts`: ArkTS/HarmonyOS project root detection, source file discovery, project document loading, and relative module resolution
- `selection-range.ts`: text-based nested selection ranges for identifiers, statements, and brace blocks
