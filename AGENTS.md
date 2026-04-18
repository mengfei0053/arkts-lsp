# AGENTS.md

## Scope

This file applies to the whole repository unless a deeper `AGENTS.md` overrides it.

## Project Mission

- Build a lightweight, testable ArkTS language server.
- Prefer small, reviewable milestones over large speculative rewrites.
- Keep the project runnable with `npm install`, `npm run build`, `npm run check`, and `npm test`.

## Working Rules

- Preserve the current MVP-first approach.
- Favor extracting pure functions into focused modules before adding new protocol handlers.
- Add or update tests for behavior changes whenever practical.
- Update the nearest relevant `AGENTS.md` when directory responsibilities, conventions, or workflows change.

## Code Style

- Use TypeScript with strict typing.
- Prefer small functions with explicit inputs and outputs.
- Keep LSP wiring thin and move reusable logic into `src/core.ts` or similar modules.
- Avoid adding heavy dependencies unless they unlock clear ArkTS or LSP value.

## Validation

- Run `npm run build`
- Run `npm run check`
- Run `npm test`

## Directory Map

- `src/`: language server runtime and reusable analysis helpers
- `test/`: unit and integration coverage for server behavior
