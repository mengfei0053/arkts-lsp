#include "tree_sitter/parser.h"

// 空的外部扫描器实现（因为 grammar.js 中没有定义外部扫描器）
void *tree_sitter_arkts_external_scanner_create(void) { return NULL; }
void tree_sitter_arkts_external_scanner_destroy(void *payload) {}
bool tree_sitter_arkts_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) { return false; }
unsigned tree_sitter_arkts_external_scanner_serialize(void *payload, char *buffer) { return 0; }
void tree_sitter_arkts_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {}
