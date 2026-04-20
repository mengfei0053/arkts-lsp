# AGENTS.md

## Scope

This file applies to everything under `test/`.

## Testing Goals

- Protect the current MVP behaviors from regression.
- Keep tests fast enough to run on every local iteration.
- Prefer deterministic tests over environment-dependent checks.
- Cover ArkTS semantic tweaks with focused regression tests when behavior changes.

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
