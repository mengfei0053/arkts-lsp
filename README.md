# arkts-lsp

`arkts-lsp` is a lightweight Language Server Protocol implementation for ArkTS projects.

The current goal of the repository is to provide a clean MVP that we can iterate on:

- project bootstrap for Node.js + TypeScript
- a runnable LSP server
- full text document sync
- simple diagnostics
- simple hover support
- simple document/workspace symbols
- simple definition lookup based on indexed declarations
- simple references lookup based on exact identifier matches
- simple completion from ArkTS keywords and indexed workspace symbols
- simple document highlight for exact identifier matches
- simple rename that produces workspace edits from exact identifier matches

## Status

This is an early scaffold focused on establishing the server architecture and local developer workflow.

Current capabilities:

- incremental text synchronization
- TODO and `any` diagnostics
- hover preview for the current line
- regex-based symbol extraction for common ArkTS/TypeScript declarations
- workspace symbol search across open documents
- basic definition lookup by symbol name
- exact-word reference lookup across open documents
- lightweight keyword and symbol completion suggestions
- exact-word document highlights in the current file
- workspace rename edits for exact-word matches in open documents

## Quick Start

```bash
npm install
npm run build
npm run start
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
- basic definition resolution
- hover formatting

## Roadmap

Near-term milestones:

1. Stabilize the MVP server lifecycle and workspace handling
2. Add definition, references, symbols, and completion
3. Add ArkTS-aware project and module resolution
4. Add editor integration tests and a VS Code client
