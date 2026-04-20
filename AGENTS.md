# AGENTS.md

## Scope

This file applies to the whole repository unless a deeper `AGENTS.md` overrides it.

## Project Mission

- Build a lightweight, testable ArkTS language server.
- Prefer small, reviewable milestones over large speculative rewrites.
- Keep the project runnable with `npm install`, `npm run build`, `npm run check`, and `npm test`.
- Keep the current MVP-first architecture: text-based heuristics first, deeper semantics only when they clearly improve editor usefulness.

## Current Focus

- Improve ArkTS component ergonomics with lightweight semantic handling for `@State`, `@Prop`, and `@Link`.
- Improve `this.` instance-member completion inside ArkTS components.
- Keep hover, definition, references, and rename behavior aligned with the symbol model already used in the codebase.
- Preserve the existing import/export and linked-reference behavior while refining it incrementally.

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
- `scripts/`: local wrapper scripts used for editor and tool integration
- `examples/`: sample configuration files for external integrations such as opencode
