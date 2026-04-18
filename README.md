# arkts-lsp

[English README](./README.en.md)

`arkts-lsp` 是一个面向 ArkTS/HarmonyOS 工程的轻量级 Language Server Protocol 实现。

项目当前的核心目标不是一次性做成完整编译器级语言服务，而是先提供一个可以持续迭代的、可运行、可测试、可接入编辑器和工具链的 ArkTS LSP。

最终方向是让类似 `opencode` 这样的工具在处理 ArkTS 文件时，可以稳定启动 `arkts-lsp`，并正常使用常见 LSP 能力。

## 当前目标

当前阶段优先完成一个可持续演进的 MVP：

- 完成 Node.js + TypeScript 项目骨架
- 提供可运行的 LSP 服务端
- 支持增量文本同步
- 支持基础诊断、悬浮、跳转、引用、补全、重命名等能力
- 建立测试基础，保证后续迭代不轻易回退

## 当前能力

目前已经具备的能力包括：

- 增量文本同步
- `TODO` 和 `any` 的基础诊断
- 当前行悬浮信息
- 基于正则的 ArkTS/TypeScript 常见声明符号提取
- 文档符号和工作区符号搜索
- 基于符号名的基础定义跳转
- 基于精确标识符匹配的引用查询
- 基于 ArkTS 关键字和工作区符号的轻量补全
- 相对 import 路径的模块解析与路径补全
- 当前文档中的标识符高亮
- 基于精确标识符匹配生成 `WorkspaceEdit` 的重命名
- ArkTS/HarmonyOS 项目根识别
- `.ets` / `.ts` 文件扫描与项目级文档加载
- 相对 import 路径 definition 跳转
- 相对 import 路径 completion 候选
- 面向 `opencode` 的接入脚本和配置示例

## 当前状态

项目仍处于早期阶段，重点放在：

- 稳定 LSP 服务端生命周期
- 提升可测试性
- 逐步从“文本级匹配”升级为“ArkTS 项目级感知”
- 面向真实鸿蒙项目逐步验证 `opencode` 接入

## 快速开始

```bash
npm install
npm run build
npm run start -- --stdio
```

如果只是本地开发，也可以直接运行：

```bash
npm run dev -- --stdio
```

## 常用脚本

- `npm run build`：编译 TypeScript 到 `dist/`
- `npm run dev`：使用 `tsx` 启动开发态服务
- `npm run start`：运行编译后的服务
- `npm run check`：执行 TypeScript 类型检查
- `npm test`：运行 Vitest 单元测试

## 测试覆盖

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
- 项目根识别
- 项目文件扫描与项目级上下文加载

## 最终目标

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

## 后续路线

接下来的主线工作会集中在：

1. import / module 解析
2. 把 definition / references / rename 从文本级匹配继续提升到项目级解析
3. 增加更贴近真实工程的 fixture 和集成测试
4. 准备更完整的 `opencode` 端到端验证
5. 优化补全和诊断质量

## opencode 接入

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
