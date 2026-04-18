# AGENTS.md

## Scope

This file applies to everything under `src/`.

## Purpose

- Keep runtime server code easy to read, test, and extend.
- Separate transport-layer LSP handlers from reusable analysis logic.

## Implementation Guidelines

- Put protocol wiring and connection lifecycle code in `index.ts` or a dedicated server entry module.
- Put reusable parsing, symbol, diagnostic, and navigation helpers in focused modules re-exported by `core.ts`.
- Prefer pure functions for logic that can be tested without starting an LSP process.
- Keep ArkTS-specific behavior explicit and documented in code or tests.
- Keep each `.ts` file at 400 lines or fewer; split by responsibility before crossing that boundary.

## Change Expectations

- If a feature adds a new analysis capability, expose it through a reusable function first when reasonable.
- If a change alters behavior, add or update tests in `test/`.
- Update this file when the source layout or implementation conventions materially change.

## Current Boundaries

- `index.ts`: LSP connection setup and request/notification registration
- `core.ts`: lightweight barrel that re-exports analysis modules
- `types.ts`: shared analysis types
- `diagnostics.ts`: basic diagnostic rules
- `text.ts`: word lookup, import parsing, member/call context parsing, and small text utilities
- `symbols.ts`: symbol extraction, export discovery, and symbol presentation helpers
- `navigation.ts`: definition, references, highlights, and rename flows
- `completion.ts`: keyword, import, and class member completion helpers
- `hover.ts`: base hover and import/export-aware hover
- `signature.ts`: signature help parsing and resolution
- `project.ts`: ArkTS/HarmonyOS project root detection, source file discovery, project document loading, and relative module resolution
