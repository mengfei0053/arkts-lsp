# arkts-lsp

[English README](./README.en.md)

`arkts-lsp` 是一个面向 ArkTS/HarmonyOS 工程的轻量级 Language Server Protocol 实现，支持 28 项 LSP 能力，31/31 功能覆盖验证通过。

项目已实现 **P0-P5 全部 23 个里程碑**，具备完整的装饰器语义（25 个）、类型系统感知、跨文件组件/builder 解析、调用/类型层级等能力。通过 `opencode` 集成可在真实鸿蒙项目中稳定工作。

## 当前能力（28 项 LSP 功能）

### 核心导航
- **增量文本同步**：`didOpen` / `didChange` / `didClose`
- **定义跳转**：同文件 + 跨文件（import/export 感知、@Builder 追踪）
- **引用查找**：`@Provide/@Consume` 跨文档联动 + 文本级搜索
- **重命名**：工作区编辑生成，`@Provide/@Consume` 联动

### 代码智能
- **补全**：关键字（43+）、`this.` 实例成员、import 路径、静态成员
- **签名帮助**：实例方法 + 静态方法 + `this.field.method()` 链式调用
- **悬停信息**：struct/@State/@Prop/@Link/@Provide/@Consume/@Observed/@Builder 语义、类型感知
- **Inlay Hints**：参数名提示 + 无类型变量类型推断（number/string/boolean）

### 诊断与修复
- **诊断**：`any` 检测、TODO 标记、组件 props 校验（未知/缺少必传）
- **V2 约束校验**：V1/V2 混用、@Param/@Event 作用域、@Computed getter、@Trace 作用域
- **Code Actions**：`TODO` / `any` 快速修复

### 符号与层级
- **文档符号**：分层结构化（struct 成员嵌套为 children）
- **工作区符号**：全项目搜索 + 启动预索引
- **调用层级**：prepareCallHierarchy + incomingCalls + outgoingCalls
- **类型层级**：struct + class 支持，supertypes + subtypes

### 编辑器辅助
- **Code Lens**：struct 上方展示组件类型 + props 数量
- **语义高亮**：keyword/type/function/variable/decorator/property
- **文档高亮**：同名标识符高亮
- **折叠范围**：多行大括号代码块
- **选择范围**：标识符/语句/代码块层级选择
- **文档链接**：相对 import 路径可点击跳转

### 工程能力
- **项目上下文**：根识别、`.ets`/`.ts` 扫描、跨文件文档加载
- **模块解析**：相对路径 + `@kit.*` / `@ohos.*` 最小解析
- **增量解析缓存**：parseCache + raw Tree + `parseArkTSIncremental()`
- **opencode 集成**：全局/项目配置 + 启动脚本 + 覆盖矩阵 31/31

### ArkTS 专属
- **25 个装饰器**：V1（13）+ V2（10）+ @Monitor/@Provider/@Consumer 键名匹配
- **组件语义**：@Builder/@BuilderParam 子树建模 + ERROR 恢复
- **跨文件解析**：组件导入追踪 + @Builder 全局/成员追踪
- **类型系统**：联合/交叉/数组/泛型/可为空 + hover + InlayHint

## 当前状态

| 指标 | 数据 |
|---|---|
| 单元测试 | 33 文件 / 298 用例 ✅ |
| 集成覆盖 | 31/31 LSP 功能 ✅ |
| 装饰器 | V1(13) + V2(10) + 2 键名 = 25 |
| 构建 | `npm run build` + `npm run check` ✅ |
| opencode | 全局 + 项目级配置 + 启动脚本 |
| 测试项目 | `test-fixture/` — 9 源文件鸿蒙工程 |

## 快速开始

### 从 npm 安装

```bash
npm install -g @fe-essential/arkts-lsp
arkts-lsp --stdio
```

或使用 npx（免安装）：

```bash
npx --yes --registry https://registry.npmjs.org/ @fe-essential/arkts-lsp --stdio
```

### 本地开发

```bash
git clone <repo>
cd arkts-lsp
npm install
npm run build
npm run start -- --stdio
```

## 常用脚本

| 命令 | 用途 |
|---|---|
| `npm run build` | 编译 TypeScript 到 `dist/` |
| `npm run dev` | `tsx` 开发态服务 |
| `npm run start` | 运行编译后服务 |
| `npm run check` | TypeScript 类型检查 |
| `npm test` | 298 单元测试 |
| `node scripts/coverage-matrix.cjs` | 31 项 LSP 全功能验证 |
| `node scripts/integration-test.cjs` | 快速集成测试（8 项） |

## 测试覆盖

### 单元测试（33 文件 / 298 用例）
parser、decorator metadata/hover/diagnostics、V2 约束、component props、builder resolver、workspace indexer、incremental parse、cross-file component、hierarchical symbols、call hierarchy、type hierarchy、type model、type inlay、CodeLens、completion、hover、code action、semantic tokens、inlay hint、project API、e2e protocol

### 集成测试
- `scripts/integration-test.cjs` — 符号/补全/跳转/hover/诊断（8 项）
- `scripts/coverage-matrix.cjs` — 全功能覆盖（31 项），使用 `test-fixture/` 鸿蒙项目

## opencode 接入

### 方式一：npx 免安装（推荐，首次自动下载）

无需全局安装，opencode 启动时 `npx` 自动拉取最新版本：

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

**在鸿蒙工程中接管全部 `.ets` + `.ts`（禁用默认 TS LSP）：**

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

> 配置文件放于项目根目录 `opencode.json` 或全局 `~/.config/opencode/opencode.json`。建议保留 `--yes` 与 `--registry https://registry.npmjs.org/`，避免首次 npx 交互确认、镜像同步延迟或 OpenCode 初始化超时。

### 方式二：全局安装

```bash
npm install -g @fe-essential/arkts-lsp
```

然后 opencode 直接引用命令名：

```json
{
  "lsp": {
    "arkts-lsp": {
      "command": ["arkts-lsp"],
      "extensions": [".ets"]
    }
  }
}
```

参考示例：[examples/opencode.global.json](examples/opencode.global.json)、[examples/opencode.project.json](examples/opencode.project.json)

## 后续路线

1. HarmonyOS API SDK 驱动 + 完整签名库
2. Linked Editing Ranges / Moniker
3. 文件监听 + workspace/configuration
4. 真实项目集成测试 + 性能基准
