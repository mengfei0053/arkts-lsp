# AGENTS.md

## Scope

This file applies to everything under `test/`.

## Testing Goals

- Protect the current MVP behaviors from regression.
- Keep tests fast enough to run on every local iteration.
- Prefer deterministic tests over environment-dependent checks.
- Cover ArkTS semantic tweaks with focused regression tests when behavior changes.
- Cover user-visible editor assistance such as `selectionRange` and `inlayHint` with focused regressions.
- Cover user-visible editor assistance such as `selectionRange`, `inlayHint`, and `codeAction` with focused regressions.
- Cover user-visible editor assistance such as `semanticTokens` with focused regressions.

## Test Strategy

- Start with unit tests for pure helpers in `src/core.ts`.
- Use filesystem-backed temp projects when project detection or indexing cannot be validated with in-memory documents alone.
- Add integration-style tests only when behavior cannot be verified through pure functions.
- Use small in-memory `TextDocument` fixtures before introducing filesystem fixtures.
- Keep assertions behavior-focused instead of implementation-fragile.

## Change Expectations

- New user-visible behavior should usually add at least one test.
- Bug fixes should include a regression test when practical.
- When a task changes user-visible behavior or workflow, update `README.md` and the nearest relevant `AGENTS.md` in the same change whenever practical.
- Update this file if test organization or test philosophy changes.
