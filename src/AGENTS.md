# AGENTS.md

## Scope

This file applies to everything under `src/`.

## Purpose

- Keep runtime server code easy to read, test, and extend.
- Separate transport-layer LSP handlers from reusable analysis logic.

## Implementation Guidelines

- Put protocol wiring and connection lifecycle code in `index.ts` or a dedicated server entry module.
- Put reusable parsing, symbol, diagnostic, and navigation helpers in focused modules such as `core.ts`.
- Prefer pure functions for logic that can be tested without starting an LSP process.
- Keep ArkTS-specific behavior explicit and documented in code or tests.

## Change Expectations

- If a feature adds a new analysis capability, expose it through a reusable function first when reasonable.
- If a change alters behavior, add or update tests in `test/`.
- Update this file when the source layout or implementation conventions materially change.

## Current Boundaries

- `index.ts`: LSP connection setup and request/notification registration
- `core.ts`: diagnostics, symbols, hover formatting, word lookup, definition helpers, reference/highlight lookup, rename edit construction, and completion helpers
