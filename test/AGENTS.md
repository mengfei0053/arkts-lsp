# AGENTS.md

## Scope

This file applies to everything under `test/`.

## Testing Goals

- Protect the current MVP behaviors from regression.
- Keep tests fast enough to run on every local iteration.
- Prefer deterministic tests over environment-dependent checks.

## Test Strategy

- Start with unit tests for pure helpers in `src/core.ts`.
- Add integration-style tests only when behavior cannot be verified through pure functions.
- Use small in-memory `TextDocument` fixtures before introducing filesystem fixtures.
- Keep assertions behavior-focused instead of implementation-fragile.

## Change Expectations

- New user-visible behavior should usually add at least one test.
- Bug fixes should include a regression test when practical.
- Update this file if test organization or test philosophy changes.
