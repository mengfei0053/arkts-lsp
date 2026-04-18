# arkts-lsp

`arkts-lsp` is a lightweight Language Server Protocol implementation for ArkTS projects.

The current goal of the repository is to provide a clean MVP that we can iterate on:

- project bootstrap for Node.js + TypeScript
- a runnable LSP server
- full text document sync
- simple diagnostics
- simple hover support

## Status

This is an early scaffold focused on establishing the server architecture and local developer workflow.

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

## Roadmap

Near-term milestones:

1. Stabilize the MVP server lifecycle and workspace handling
2. Add definition, references, symbols, and completion
3. Add ArkTS-aware project and module resolution
4. Add editor integration tests and a VS Code client
