# arkts-lsp

[中文 README](./README.md)

`arkts-lsp` is a lightweight Language Server Protocol implementation for ArkTS/HarmonyOS projects, with 28 LSP capabilities and 31/31 feature coverage verified end-to-end.

All P0-P5 milestones are complete — full decorator semantics (25), type-system awareness, cross-file component/builder resolution, call/type hierarchy, and opencode integration.

## Current Capabilities (28 LSP Features)

### Navigation
- Incremental text sync: `didOpen` / `didChange` / `didClose`
- Definition: same-file + cross-file (import/export-aware, @Builder tracking)
- References: `@Provide/@Consume` cross-document + text-level search
- Rename: workspace edit generation, `@Provide/@Consume` linked rename

### Intelligence
- Completion: keywords (43+), `this.` members, import paths, static members
- Signature Help: instance + static methods, `this.field.method()` chain calls
- Hover: struct/@State/@Prop/@Link/@Provide/@Consume/@Observed/@Builder with type info
- Inlay Hints: parameter names + inferred types (number/string/boolean)

### Diagnostics
- `any` detection, TODO markers, component props validation (unknown/missing required)
- V2 constraints: V1/V2 mixing, @Param/@Event scope, @Computed getter, @Trace scope
- Code Actions: TODO / `any` quick fixes

### Symbols & Hierarchy
- Document Symbols: hierarchical (struct members as children)
- Workspace Symbols: project-wide search + startup pre-indexing
- Call Hierarchy: prepareCallHierarchy + incomingCalls + outgoingCalls
- Type Hierarchy: struct + class support, supertypes + subtypes

### Editor Features
- Code Lens: component type + props count above struct declarations
- Semantic Tokens: keyword/type/function/variable/decorator/property
- Document Highlights: same-name identifier highlighting
- Folding Ranges: multi-line brace blocks
- Selection Ranges: identifier/statement/block nesting
- Document Links: clickable relative import paths

### Project & Integration
- Project context: root detection, `.ets`/`.ts` scanning, cross-file document loading
- Module resolution: relative + `@kit.*` / `@ohos.*` minimal support
- Incremental parse cache: parseCache + raw Tree + `parseArkTSIncremental()`
- opencode: global/project config + launcher + 31/31 coverage matrix

### ArkTS-Specific
- 25 decorators: V1 (13) + V2 (10) + @Monitor/@Provider/@Consumer key matching
- Component semantics: @Builder/@BuilderParam tree + ERROR recovery
- Cross-file: import tracking + @Builder global/member resolution
- Type system: union/intersection/array/generic/nullable + hover + InlayHint

## Status

| Metric | Value |
|---|---|
| Unit tests | 33 files / 298 cases ✅ |
| Feature coverage | 31/31 LSP features ✅ |
| Decorators | V1(13) + V2(10) + 2 key-match = 25 |
| Build | `npm run build` + `npm run check` ✅ |
| opencode | Global + project config + launcher script |
| Test fixture | `test-fixture/` — 9-source HarmonyOS project |

## Quick Start

### From npm

```bash
npm install -g @fe-essential/arkts-lsp
arkts-lsp --stdio
```

Or via npx:

```bash
npx --yes --registry https://registry.npmjs.org/ @fe-essential/arkts-lsp --stdio
```

### Local development

```bash
git clone <repo>
cd arkts-lsp
npm install
npm run build
npm run start -- --stdio
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Dev server with `tsx` |
| `npm run start` | Run compiled server |
| `npm run check` | TypeScript type check |
| `npm test` | 298 unit tests |
| `node scripts/coverage-matrix.cjs` | 31-feature LSP verification |
| `node scripts/integration-test.cjs` | Quick integration test (8 checks) |

## Testing

### Unit tests (33 files / 298 cases)
parser, decorator metadata/hover/diagnostics, V2 constraints, component props, builder resolver, workspace indexer, incremental parse, cross-file component, hierarchical symbols, call hierarchy, type hierarchy, type model, type inlay, CodeLens, completion, hover, code action, semantic tokens, inlay hint, project API, e2e protocol

### Integration tests
- `scripts/integration-test.cjs` — symbols/completion/definition/hover/diagnostics (8 checks)
- `scripts/coverage-matrix.cjs` — full feature coverage (31 checks) using `test-fixture/`

## opencode Integration

### npx config (.ets only, recommended)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "lsp": {
    "arkts-lsp": {
      "command": ["npx", "--yes", "--registry", "https://registry.npmjs.org/", "@fe-essential/arkts-lsp"],
      "extensions": [".ets"]
    }
  }
}
```

### Project-level npx config (.ets + .ts, disable default TS LSP)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "lsp": {
    "typescript": { "disabled": true },
    "arkts-lsp": {
      "command": ["npx", "--yes", "--registry", "https://registry.npmjs.org/", "@fe-essential/arkts-lsp"],
      "extensions": [".ets", ".ts"],
      "initialization": {
        "projectMarkers": ["AppScope/app.json5", "hvigorfile.ts", "build-profile.json5", "oh-package.json5"]
      }
    }
  }
}
```

See examples: [examples/opencode.global.json](examples/opencode.global.json), [examples/opencode.project.json](examples/opencode.project.json)

Put project-level config in `opencode.json`, or global config in `~/.config/opencode/opencode.json`. Keeping `--yes` and `--registry https://registry.npmjs.org/` avoids first-run npx prompts, npm mirror lag, and OpenCode LSP initialization timeouts.

## Roadmap

1. HarmonyOS API SDK-driven with full signature library
2. Linked Editing Ranges / Moniker
3. File watching + workspace/configuration
4. Real project integration tests + performance benchmarks
