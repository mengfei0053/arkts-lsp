# arkts-lsp

[中文 README](./README.md)

`arkts-lsp` is a lightweight Language Server Protocol implementation for ArkTS/HarmonyOS projects.

The project intentionally follows an MVP-first path. The short-term goal is not to build a compiler-grade ArkTS language engine all at once, but to provide a runnable, testable, extensible LSP server that can later be integrated into tools such as `opencode`.

## Current Goal

The repository is currently focused on a clean, iterative MVP:

- project bootstrap for Node.js + TypeScript
- a runnable LSP server
- incremental text synchronization
- basic diagnostics, hover, navigation, completion, and rename support
- test coverage for the most regression-prone core behaviors

## Current Capabilities

- incremental text synchronization
- TODO and `any` diagnostics
- basic hover plus import/export-aware, more descriptive symbol hover
- regex-based symbol extraction for common ArkTS/TypeScript declarations
- document symbols and workspace symbols
- basic definition lookup by symbol name, with more semantically relevant navigation results
- import/export-aware definition, references, and rename
- semantic hover, definition, references, and rename for ArkTS component fields using `@State`, `@Prop`, and `@Link`
- lightweight completion from ArkTS keywords, indexed workspace symbols, and named-import exports
- more accurate `this.` instance-member completion inside ArkTS components
- static member completion for imported classes
- signature help for imported functions and class methods
- relative import path resolution and path completion
- document links for relative import specifiers
- exact-word document highlights in the current file
- ArkTS/HarmonyOS project root detection
- `.ets` / `.ts` file scanning and project-level document loading
- definition jumps on relative import specifiers
- relative import path completion candidates
- `opencode` integration scripts and config examples

## Status

This is still an early scaffold focused on:

- stabilizing the server lifecycle
- improving testability
- gradually moving from text-level matching to ArkTS project-aware behavior
- prioritizing import/export-aware navigation, rename, and completion flows
- validating `opencode` integration against real HarmonyOS projects
- keeping `README.md` and relevant `AGENTS.md` files updated when behavior or workflow changes

## Quick Start

```bash
npm install
npm run build
npm run start -- --stdio
```

For local development:

```bash
npm run dev -- --stdio
```

## Scripts

- `npm run build`: compile TypeScript to `dist/`
- `npm run dev`: run the server with `tsx`
- `npm run start`: run the compiled server
- `npm run check`: type-check without emitting files
- `npm test`: run the unit test suite with Vitest

## Testing

Current tests cover the core behaviors that are easiest to regress while the server is still evolving:

- diagnostics extraction
- symbol extraction
- word lookup at a cursor position
- workspace symbol filtering
- definition resolution
- reference lookup
- completion results
- hover formatting
- ArkTS component field semantics and `this.` member completion
- document highlight
- rename workspace edits
- project root detection
- project file scanning and project-context loading
- document-link generation for relative import specifiers

## End Goal

The end goal is to make `arkts-lsp` usable from `opencode`, so that ArkTS files can benefit from standard LSP features during code generation and editing.

In the target setup, `opencode` should be able to launch `arkts-lsp` automatically for ArkTS files and use:

- `hover`
- `definition`
- `references`
- `rename`
- `completion`
- `diagnostics`

## Roadmap

The next major milestones are:

1. import and module resolution
2. upgrading definition / references / rename further from text matching to project-aware behavior
3. adding more realistic fixtures and integration-style tests
4. expanding end-to-end `opencode` validation
5. improving completion and diagnostics quality

## opencode Integration

OpenCode officially supports custom LSP servers through the `lsp` section in `opencode.json`.

Useful paths:

- global config: `~/.config/opencode/opencode.json`
- project config: `opencode.json` in the project root

This repository includes:

- [examples/opencode.global.json](/Users/menghongfei/projects/arkts-lsp/examples/opencode.global.json:1)
- [examples/opencode.project.json](/Users/menghongfei/projects/arkts-lsp/examples/opencode.project.json:1)
- [scripts/opencode-arkts-lsp](/Users/menghongfei/projects/arkts-lsp/scripts/opencode-arkts-lsp:1)

Recommended rollout:

1. Enable `.ets` globally first
2. Add project-level config in real ArkTS/HarmonyOS workspaces
3. Disable the built-in TypeScript LSP per ArkTS project if you want `.ts` files handled by `arkts-lsp`

A minimal global example:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "lsp": {
    "arkts-lsp": {
      "command": ["/Users/menghongfei/projects/arkts-lsp/scripts/opencode-arkts-lsp"],
      "extensions": [".ets"]
    }
  }
}
```

A recommended project-level setup:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "lsp": {
    "typescript": {
      "disabled": true
    },
    "arkts-lsp": {
      "command": ["/Users/menghongfei/projects/arkts-lsp/scripts/opencode-arkts-lsp"],
      "extensions": [".ets", ".ts"]
    }
  }
}
```
