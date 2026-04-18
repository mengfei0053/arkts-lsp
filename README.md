# arkts-lsp

## 中文说明

`arkts-lsp` 是一个面向 ArkTS/HarmonyOS 工程的轻量级 Language Server Protocol 实现。

项目当前的核心目标不是一次性做成完整编译器级语言服务，而是先提供一个可以持续迭代的、可运行、可测试、可接入编辑器和工具链的 ArkTS LSP。

最终方向是让类似 `opencode` 这样的工具在处理 ArkTS 文件时，可以稳定启动 `arkts-lsp`，并正常使用常见 LSP 能力。

### 当前目标

当前阶段优先完成一个可持续演进的 MVP：

- 完成 Node.js + TypeScript 项目骨架
- 提供可运行的 LSP 服务端
- 支持增量文本同步
- 支持基础诊断、悬浮、跳转、引用、补全、重命名等能力
- 建立测试基础，保证后续迭代不轻易回退

### 当前能力

目前已经具备的能力包括：

- 增量文本同步
- `TODO` 和 `any` 的基础诊断
- 当前行悬浮信息
- 基于正则的 ArkTS/TypeScript 常见声明符号提取
- 文档符号和工作区符号搜索
- 基于符号名的基础定义跳转
- 基于精确标识符匹配的引用查询
- 基于 ArkTS 关键字和工作区符号的轻量补全
- 当前文档中的标识符高亮
- 基于精确标识符匹配生成 `WorkspaceEdit` 的重命名

### 当前状态

项目仍处于早期阶段，重点放在：

- 稳定 LSP 服务端生命周期
- 提升可测试性
- 逐步从“文本级匹配”升级为“ArkTS 项目级感知”

换句话说，现在已经能提供一部分实用能力，但距离“真实 HarmonyOS 工程里长期稳定可用”还有几个阶段要完成。

### 快速开始

```bash
npm install
npm run build
npm run start -- --stdio
```

如果只是本地开发，也可以直接运行：

```bash
npm run dev -- --stdio
```

### 常用脚本

- `npm run build`：编译 TypeScript 到 `dist/`
- `npm run dev`：使用 `tsx` 启动开发态服务
- `npm run start`：运行编译后的服务
- `npm run check`：执行 TypeScript 类型检查
- `npm test`：运行 Vitest 单元测试

### 测试覆盖

当前测试主要覆盖最容易在早期迭代中回退的核心行为：

- diagnostics 提取
- symbol 提取
- 光标位置取词
- workspace symbol 过滤
- definition 解析
- references 查询
- completion 结果
- hover 内容格式化
- document highlight
- rename 生成的 workspace edit

### 最终目标

这个项目的最终目标是：

1. 把 `arkts-lsp` 做成一个稳定可启动的标准 LSP 服务
2. 让它具备 ArkTS/HarmonyOS 工程级别的项目感知能力
3. 将其接入 `opencode`
4. 让 `opencode` 在编写 ArkTS 代码时，能够稳定使用 LSP 能力

理想状态下，`opencode` 可以在打开 ArkTS 文件时自动启动 `arkts-lsp`，并获得这些能力：

- `hover`
- `definition`
- `references`
- `rename`
- `completion`
- `diagnostics`

### 后续路线

接下来的主线工作会集中在：

1. ArkTS/HarmonyOS 项目根识别
2. `.ets` / `.ts` 文件扫描与索引
3. import / module 解析
4. 把 definition / references / rename 从文本级匹配提升到项目级解析
5. 增加更贴近真实工程的 fixture 和集成测试
6. 准备 `opencode` 接入配置和端到端验证

### opencode 接入

根据 OpenCode 官方文档，LSP 可以通过 `opencode.json` 里的 `lsp` 字段自定义配置。文档说明：

- 全局配置文件路径：`~/.config/opencode/opencode.json`
- 项目配置文件路径：项目根目录下的 `opencode.json`
- 自定义 LSP 需要提供 `command` 和 `extensions`

仓库里已经提供了两个示例配置：

- [examples/opencode.global.json](/Users/menghongfei/projects/arkts-lsp/examples/opencode.global.json:1)
- [examples/opencode.project.json](/Users/menghongfei/projects/arkts-lsp/examples/opencode.project.json:1)

并提供了一个稳定启动脚本：

- [scripts/opencode-arkts-lsp](/Users/menghongfei/projects/arkts-lsp/scripts/opencode-arkts-lsp:1)

推荐的接入方式：

1. 全局先启用 `.ets` 支持，避免影响普通 TypeScript 项目
2. 在真正的 ArkTS/HarmonyOS 项目根目录下放置项目级 `opencode.json`
3. 如果该项目里的 `.ts` 文件也希望由 `arkts-lsp` 接管，就在项目级配置中关闭 `typescript` 并把 `.ts` 加到 `extensions`

一个最小可用的全局配置示例：

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

如果是 ArkTS 项目级配置，推荐：

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

这样做的目的，是让 `opencode` 在写 ArkTS 页面、组件和同项目辅助 `.ts` 文件时，都优先走 `arkts-lsp`。

---

## English

`arkts-lsp` is a lightweight Language Server Protocol implementation for ArkTS projects.

The project is intentionally taking an MVP-first approach. The short-term goal is not to build a compiler-grade ArkTS language engine all at once, but to provide a runnable, testable, extensible LSP server that can later be integrated into tools such as `opencode`.

### Current Goal

The repository is currently focused on a clean, iterative MVP:

- project bootstrap for Node.js + TypeScript
- a runnable LSP server
- incremental text synchronization
- basic diagnostics, hover, navigation, completion, and rename support
- test coverage for the most regression-prone core behaviors

### Current Capabilities

- incremental text synchronization
- TODO and `any` diagnostics
- hover preview for the current line
- regex-based symbol extraction for common ArkTS/TypeScript declarations
- document symbols and workspace symbols
- basic definition lookup by symbol name
- exact-word reference lookup across open documents
- lightweight completion from ArkTS keywords and indexed workspace symbols
- exact-word document highlights in the current file
- workspace rename edits for exact-word matches in open documents

### Status

This is still an early scaffold focused on:

- stabilizing the server lifecycle
- improving testability
- gradually moving from text-level matching to ArkTS project-aware behavior

### Quick Start

```bash
npm install
npm run build
npm run start -- --stdio
```

For local development:

```bash
npm run dev -- --stdio
```

### Scripts

- `npm run build`: compile TypeScript to `dist/`
- `npm run dev`: run the server with `tsx`
- `npm run start`: run the compiled server
- `npm run check`: type-check without emitting files
- `npm test`: run the unit test suite with Vitest

### Testing

Current tests cover the core behaviors that are easiest to regress while the server is still evolving:

- diagnostics extraction
- symbol extraction
- word lookup at a cursor position
- workspace symbol filtering
- definition resolution
- reference lookup
- completion results
- hover formatting
- document highlight
- rename workspace edits

### End Goal

The end goal is to make `arkts-lsp` usable from `opencode`, so that ArkTS files can benefit from standard LSP features during code generation and editing.

In the target setup, `opencode` should be able to launch `arkts-lsp` automatically for ArkTS files and use:

- `hover`
- `definition`
- `references`
- `rename`
- `completion`
- `diagnostics`

### Roadmap

The next major milestones are:

1. ArkTS/HarmonyOS project root detection
2. `.ets` / `.ts` file scanning and indexing
3. import and module resolution
4. upgrading definition / references / rename from text matching to project-aware behavior
5. adding fixture-based and integration-style tests
6. preparing `opencode` integration and end-to-end validation

### opencode Integration

OpenCode officially supports custom LSP servers through the `lsp` section in `opencode.json`.

Useful paths:

- global config: `~/.config/opencode/opencode.json`
- project config: `opencode.json` in the project root

This repository now includes:

- [examples/opencode.global.json](/Users/menghongfei/projects/arkts-lsp/examples/opencode.global.json:1)
- [examples/opencode.project.json](/Users/menghongfei/projects/arkts-lsp/examples/opencode.project.json:1)
- [scripts/opencode-arkts-lsp](/Users/menghongfei/projects/arkts-lsp/scripts/opencode-arkts-lsp:1)

Recommended rollout:

1. Enable `.ets` globally first
2. Add project-level config in real ArkTS/HarmonyOS workspaces
3. Disable the built-in TypeScript LSP per ArkTS project if you want `.ts` files handled by `arkts-lsp`
