# tree-sitter-arkts

ArkTS 语言的 tree-sitter 解析器，用于语法高亮、代码分析、VSCode 插件等场景。

## 特性

- ✅ 完整的 ArkTS 语法支持
- ✅ 支持 ArkUI 组件语法（component_statement, style_statement）
- ✅ 支持 struct 声明
- ✅ 支持装饰器
- ✅ TypeScript 类型定义
- ✅ 跨平台支持（Windows, macOS, Linux）

## 安装

```bash
npm install tree-sitter-arkts
```

## 使用方法

### TypeScript/JavaScript

```typescript
import { Parser, createParser, parse } from 'tree-sitter-arkts';

// 方法 1: 使用便捷函数
const tree = parse('@Entry()\nstruct MyComponent {\n  build() {}\n}');

// 方法 2: 创建解析器实例
const parser = createParser();
const tree2 = parser.parse(sourceCode);

// 方法 3: 手动创建
import { Parser, ArkTS } from 'tree-sitter-arkts';
const parser = new Parser();
parser.setLanguage(ArkTS);
const tree3 = parser.parse(sourceCode);
```

## 开发

### 构建

```bash
# 生成解析器代码并构建原生模块
npm run build

# 仅生成解析器代码
npm run generate

# 仅编译 TypeScript
npm run build:ts
```

### 测试

```bash
# 完整功能测试（需要 tree-sitter 原生模块）
npm test

# 仅验证包结构（不需要 tree-sitter 原生模块）
npm run test:structure
```

**注意**: 
- 完整功能测试需要 tree-sitter 原生模块
- **Node.js 版本兼容性**: 
  - ✅ **Node.js v24**: 已支持（需要 C++20 编译器，如 GCC 12+）
  - ✅ **Node.js v18/v20/v22**: 完全支持
  - 安装时会自动修复 tree-sitter 的构建配置以支持 Node.js v24

## Windows 构建说明

在 Windows 上构建原生模块需要：

1. **安装构建工具**：
   - 安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) 或 Visual Studio（包含 C++ 工作负载）
   - 或者安装 [windows-build-tools](https://github.com/felixrieseberg/windows-build-tools): `npm install -g windows-build-tools`

2. **安装 Python**：
   - 确保已安装 Python 2.7 或 3.x
   - node-gyp 需要 Python 来构建原生模块

3. **安装依赖并构建**：
   ```bash
   npm install
   ```
   这会自动运行 `node-gyp rebuild` 来构建原生模块。

## VSCode 插件使用示例

```typescript
import { createParser } from 'tree-sitter-arkts';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const parser = createParser();
  
  const disposable = vscode.workspace.onDidChangeTextDocument(event => {
    const tree = parser.parse(event.document.getText());
    // 使用语法树进行代码分析、高亮等
  });
  
  context.subscriptions.push(disposable);
}
```

## 项目结构

- `grammar.js` - ArkTS 语法定义文件
- `binding.gyp` - Node.js 原生模块构建配置
- `index.ts` - TypeScript 入口文件
- `bindings/node/binding.cc` - Node.js 绑定代码
- `src/` - 由 tree-sitter generate 生成的 C 代码

## 依赖

- `tree-sitter` - Tree-sitter 核心库
- `nan` - Node.js 原生模块开发工具
- `tree-sitter-typescript` - TypeScript 语法基础（grammar.js 中引用）

