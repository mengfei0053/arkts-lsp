# TODO —— ArkTS LSP 路线图

> 本文件用于跟踪当前 MVP 与最终目标之间的差距：把 `arkts-lsp` 逐步演进成一个稳定、面向真实 HarmonyOS 工程、可被 `opencode` 自动拉起的项目级 ArkTS LSP。

## ✅ 已实现

以下能力已经可用，并且已有测试覆盖：

- **文本同步**：支持 `didOpen` / `didChange` / `didClose` 的增量同步
- **基础诊断**：识别 `TODO` 与基于 AST 的 `any` 用法，避免误报注释中的 `: any`
- **悬停信息**：基础符号信息、import/export 感知悬停、`@Builder` 装饰器悬停，以及 `@Provide/@Consume/@ObjectLink/@Observed` 的增强语义提示
- **符号提取**：顶层声明与成员提取已开始接入 parser，支持同一行多个顶层声明与单行 struct/class body
- **Tree-sitter 解析适配层**：新增 `src/parser.ts`，提供 struct、decorator、builder、成员、import、顶层声明等 AST 帮助函数
- **文档符号 / 工作区符号**：基础过滤与查询
- **定义跳转**：基于符号名、import/export 关联、相对路径 import 跳转
- **引用查找**：支持 import/export 关联引用
- **重命名**：生成工作区编辑结果
- **补全**：关键字、工作区符号、命名导入导出、`this.` 实例成员、导入类的静态成员
- **签名帮助**：导入函数与类方法的签名提示
- **Inlay Hints**：本地函数与导入别名的参数名提示
- **Code Actions**：针对 `TODO` / `any` 诊断的快速修复
- **语义高亮**：关键字、类型、函数、变量、装饰器、属性
- **导入路径能力**：相对路径补全 + `DocumentLink` 点击跳转
- **HarmonyOS 模块解析（最小版）**：`resolveModuleSpecifier()` 已支持相对路径、`@kit.*`、`@ohos.*`，并返回内置虚拟模块元数据
- **文档高亮**：当前文档内同名标识符高亮
- **折叠范围**：多行大括号代码块折叠
- **选择范围**：标识符、语句、代码块的层级选择
- **项目上下文**：工程根识别、`.ets` / `.ts` 扫描、项目级文档加载
- **opencode 集成**：全局 / 项目配置示例与启动脚本
- **Code Lens**：struct 声明上方展示组件类型标签 + props 数量 + 子组件树概览
- **增量解析缓存**：parseCache (uri, version, contentHash) 三级缓存 + raw Tree 保留支持 `parseArkTSIncremental()`
- **工作区符号索引**：`workspace-indexer.ts`，启动预索引 + 生命周期增量更新 + `findSymbolInWorkspace()`
- **V2 装饰器全量支持**：10 个 V2 装饰器 parser/hover/diagnostics 三层完整支持
- **V2 约束校验**：V1/V2 混用、@Param/@Event 作用域、@Computed getter、@Trace 作用域
- **组件子树语义**：@Builder/@BuilderParam slot-like 建模，range 锚定宿主，显式 slot 元数据
- **跨文件组件解析**：`component-resolver.ts`，import 绑定 → @Component/@ComponentV2 struct
- **组件 props 提取**：`component-props.ts`，@Prop/@Link/@Param/@Event + 默认值检测
- **组件调用 props 诊断**：`prop-diagnostics.ts`，未知 prop Warning + 缺少必传 prop Hint
- **跨文件 @Builder 追踪**：`builder-resolver.ts`，全局 function + struct method，definition+hover 接入

## 🟡 部分完成 / 仍需增强

以下能力已经有基础，但仍主要停留在轻量文本启发式或最小实现阶段，需要继续升级为项目级语义能力：

| 能力 | 当前状态 | 目标状态 |
|------|----------|----------|
| **Definition** | 文本/符号匹配为主，已支持 `@Consume -> @Provide` 的基础跨文档配对跳转 | 基于 AST / 项目索引的跨模块精确跳转 |
| **References** | 已支持 `@Provide/@Consume` 的跨文档联动引用；其它场景仍以文本级搜索为主 | 真正的项目级引用图 |
| **Rename** | 已支持 `@Provide/@Consume` 的跨文档联动重命名；其它场景仍以文本替换为主 | 带作用域分析与冲突检查的安全重命名 |
| **Completion** | 正则 + 工作区索引 + 命名导入导出，已加入 `build()` 内 UI 组件上下文补全，并开始复用组件树分析结果与组件路径上下文 | AST 感知、上下文敏感补全 |
| **Diagnostics** | `any` 警告 + @Watch 回调校验 + @Monitor 回调/字段校验 + @Provider/@Consumer 键名匹配 + V2 约束（V1/V2 混用/@Param/@Event 作用域/@Computed getter/@Trace 作用域）+ 组件调用 props 诊断（未知/缺失） | 更完整的类型级诊断、ArkTS 样式约束 |
| **Semantic Tokens** | 词法 + 正则分类 | 类型驱动的 token / modifier |
| **Hover** | 基于声明文本的悬停，已加入 `@Builder`、`@Provide/@Consume/@ObjectLink/@Observed` 的增强语义与基础观察链提示 | 类型签名、JSDoc、更丰富的装饰器元数据 |
| **Inlay Hints** | 仅参数名提示 | 类型推断、隐式返回类型、链式调用参数提示 |
| **解析器落地范围** | `src/parser.ts` 已存在，且已接入 `symbols` / `diagnostics` / `completion` / 部分 `navigation`，但还未覆盖全部运行时路径 | parser 驱动 `symbols` / `navigation` / `completion` / `diagnostics` |
| **HarmonyOS API 感知** | 仅内置少量 `@kit.*` / `@ohos.*` 元数据与虚拟模块 | 基于 SDK / 更完整签名的补全、悬停、跳转 |

## 🔴 未完成 / 未开始

以下能力仍未完成，或只做了非常早期的占位：

### ArkTS 专属能力
- [x] **Tree-sitter 运行时接管** —— 解析器适配层已完成，且已接入 `symbols.ts`、`navigation.ts`、`completion.ts`、`diagnostics.ts`、`hover.ts`
- [x] **`@Builder` / `@BuilderParam`** —— 已完成单文件 slot 建模 + 跨文件追踪（`builder-resolver.ts`）
- [x] **`@Provide` / `@Consume` / `@Observed` / `@ObjectLink` 语义** —— 已有增强 hover + definition 配对 + references/rename 联动；观察链（`observed-links.ts`）基础建模已完成
- [x] **`build()` 方法分析** —— 组件树（含 props/slots/modifiers）、slot 元数据、宿主 slots 列表已完成
- [x] **V2 装饰器** —— 10 个 V2 装饰器（@Local/@Param/@Event/@Provider/@Consumer/@Monitor/@Computed/@Trace/@ComponentV2/@ObservedV2）parser/hover/diagnostics 全量支持 + 约束校验
- [ ] **ArkTS 类型系统感知** —— 联合类型、可选链、类型守卫等尚未建模
- [ ] **HarmonyOS API 面增强** —— 目前不是 SDK 驱动，也没有完整签名库
- [x] **ETS 模块解析（最小版）** —— 已支持 `@kit.*` / `@ohos.*` 的最小解析

### LSP 协议扩展
- [x] **分层 Document Symbols** —— `collectHierarchicalDocumentSymbols()`，struct 成员嵌套为 children
- [x] **Call Hierarchy** —— `call-hierarchy.ts`，prepareCallHierarchy + incomingCalls + outgoingCalls
- [x] **Type Hierarchy** —— `type-hierarchy.ts`，prepareTypeHierarchy + supertypes + subtypes
- [x] **Code Lens** —— `codelens.ts`，struct 上方显示组件概览
- [ ] **扩展 Inlay Hints** —— 类型推断、链式调用参数等
- [ ] **Linked Editing Ranges**
- [ ] **Moniker**

### 工程与工具能力
- [x] **增量解析缓存** —— parseCache 三级校验 + raw Tree 保留 + `parseArkTSIncremental()`
- [x] **工作区符号索引** —— `workspace-indexer.ts`，启动预索引 + 生命周期增量
- [ ] **文件监听服务** —— 跨文件变化自动刷新项目上下文
- [ ] **Workspace 配置支持** —— `workspace/configuration` 与 feature flags
- [ ] **进度上报** —— `$/progress` 用于初始扫描与重建索引
- [ ] **真实项目集成测试** —— 基于真实 HarmonyOS 工程 fixture 的端到端验证
- [ ] **性能基准** —— 启动时间、内存、响应延迟、大项目表现

## 🎯 最终目标

最终希望 `arkts-lsp` 能做到：

1. 对真实 `.ets` / HarmonyOS 项目自动拉起
2. 提供项目级定义跳转、补全、引用、诊断、重命名
3. 理解 ArkTS / HarmonyOS 的装饰器、组件结构、模块体系、API Surface
4. 为 AI 编码工具提供更可靠的 ArkTS 语言上下文

## 📌 下一步建议优先级

### 已完成（本轮冲刺 P0-P3）
1. ✅ **`build()` 组件语义补全**：slot / @BuilderParam / builder 作用域，结构化 props，组件树
2. ✅ **`@Observed/@ObjectLink` 观察链建模**：`observed-links.ts`，双向 references/rename
3. ✅ **解析器主链接管收尾**：navigation/completion/hover/diagnostics 已全面切入 parser
4. ✅ **V2 装饰器全量支持**：10 个装饰器 parser/hover/diagnostics + 约束校验
5. ✅ **跨文件组件/builder 解析**：component-resolver + builder-resolver
6. ✅ **组件调用 props 诊断**：prop-diagnostics.ts
7. ✅ **增量解析 + 缓存**：parseCache + raw Tree + parseArkTSIncremental
8. ✅ **工作区索引**：workspace-indexer.ts
9. ✅ **Code Lens**：codelens.ts

### 下一轮建议（P4+）

### 已完成（P4）
1. ✅ **分层 Document Symbols**：`collectHierarchicalDocumentSymbols()`，struct 成员嵌套
2. ✅ **Call Hierarchy**：prepareCallHierarchy + incomingCalls + outgoingCalls
3. ✅ **Type Hierarchy**：prepareTypeHierarchy + supertypes + subtypes

### 下一轮建议（P5+）
1. **ArkTS 类型系统感知**：联合类型、可选链、类型守卫等 AST 建模
2. **扩展 Inlay Hints**：类型推断、链式调用
3. **HarmonyOS API 感知增强**：SDK 驱动 + 完整签名
4. **文件监听 + workspace/configuration**
5. **真实项目集成测试 + 性能基准**
