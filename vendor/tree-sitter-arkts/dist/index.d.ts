import Parser = require('tree-sitter');
import { Tree } from 'tree-sitter';
/**
 * ArkTS 语言对象
 */
export declare const ArkTS: any;
/**
 * 创建并配置一个解析器实例
 * @returns 配置好的 Parser 实例
 */
export declare function createParser(): Parser;
/**
 * 解析 ArkTS 源代码
 * @param sourceCode 要解析的源代码
 * @param oldTree 可选的旧语法树，用于增量解析
 * @returns 解析后的语法树
 */
export declare function parse(sourceCode: string, oldTree?: Tree): Tree;
export { Tree };
export { Parser };
