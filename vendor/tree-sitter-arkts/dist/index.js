"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Parser = exports.ArkTS = void 0;
exports.createParser = createParser;
exports.parse = parse;
const Parser = require("tree-sitter");
exports.Parser = Parser;
const path = __importStar(require("path"));
// 动态加载原生绑定模块（优先使用预编译版本）
let ParserBinding;
try {
    // 尝试使用 node-gyp-build 加载预编译版本
    ParserBinding = require('node-gyp-build')(path.join(__dirname, '..'));
}
catch (err) {
    // 回退到本地构建版本
    const rootDir = path.resolve(__dirname, '..');
    try {
        ParserBinding = require(path.join(rootDir, 'build/Release/tree_sitter_arkts_binding.node'));
    }
    catch (err2) {
        try {
            ParserBinding = require(path.join(rootDir, 'build/Debug/tree_sitter_arkts_binding.node'));
        }
        catch (err3) {
            throw new Error('tree-sitter-arkts 原生模块未找到。请运行 npm install 或 npm run build 来构建模块。');
        }
    }
}
/**
 * ArkTS 语言对象
 */
exports.ArkTS = ParserBinding;
/**
 * 创建并配置一个解析器实例
 * @returns 配置好的 Parser 实例
 */
function createParser() {
    const parser = new Parser();
    parser.setLanguage(exports.ArkTS);
    return parser;
}
/**
 * 解析 ArkTS 源代码
 * @param sourceCode 要解析的源代码
 * @param oldTree 可选的旧语法树，用于增量解析
 * @returns 解析后的语法树
 */
function parse(sourceCode, oldTree) {
    const parser = createParser();
    return parser.parse(sourceCode, oldTree);
}
