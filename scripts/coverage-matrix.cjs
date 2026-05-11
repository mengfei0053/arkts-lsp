#!/usr/bin/env node
/** ArkTS LSP 全功能覆盖矩阵 — test-fixture 项目验证 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVER = path.join(__dirname, '..', 'dist', 'index.js');
const FIXTURE = path.join(__dirname, '..', 'test-fixture');

// File paths
const indexUri  = `file://${path.join(FIXTURE, 'entry/src/main/ets/pages/Index.ets')}`;
const mainUri   = `file://${path.join(FIXTURE, 'entry/src/main/ets/pages/MainPage.ets')}`;
const detailUri = `file://${path.join(FIXTURE, 'entry/src/main/ets/pages/DetailPage.ets')}`;
const todoUri   = `file://${path.join(FIXTURE, 'entry/src/main/ets/components/TodoItem.ets')}`;
const modelUri  = `file://${path.join(FIXTURE, 'entry/src/main/ets/model/TodoModel.ets')}`;
const utilsUri  = `file://${path.join(FIXTURE, 'entry/src/main/ets/common/utils.ets')}`;
const entryUri  = `file://${path.join(FIXTURE, 'entry/src/main/ets/entryability/EntryAbility.ets')}`;

function loadAllEts() {
  const result = {};
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.name.endsWith('.ets') || e.name.endsWith('.ts'))
        result[`file://${fp}`] = fs.readFileSync(fp, 'utf8');
    }
  }
  walk(FIXTURE);
  return result;
}

const allFiles = loadAllEts();
const fileList = Object.entries(allFiles);

// LSP comm
let seq = 0, buf = Buffer.alloc(0), q = [];
function frame(m) {
  const b = Buffer.from(JSON.stringify(m), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${b.length}\r\n\r\n`, 'utf8'), b]);
}
function parseMsgs() {
  const ms = [];
  while (true) {
    const s = buf.toString('utf8');
    const i = s.indexOf('\r\n\r\n');
    if (i === -1) break;
    const m = s.slice(0, i).match(/Content-Length: (\d+)/i);
    if (!m) break;
    const l = parseInt(m[1]), st = i + 4;
    if (buf.length < st + l) break;
    try { ms.push(JSON.parse(buf.slice(st, st + l).toString('utf8'))); } catch (_) {}
    buf = buf.slice(st + l);
  }
  return ms;
}

function waitResp(id, to = 10000) {
  return new Promise((res, rej) => {
    const dl = Date.now() + to;
    (function ck() {
      const ix = q.findIndex(m => m.id === id);
      if (ix >= 0) {
        const [m] = q.splice(ix, 1);
        return m.error ? rej(new Error(JSON.stringify(m.error))) : res(m);
      }
      if (Date.now() > dl) return rej(new Error(`Timeout`));
      setTimeout(ck, 50);
    })();
  });
}

let child;
async function req(method, params) {
  const id = ++seq;
  child.stdin.write(frame({ jsonrpc: '2.0', id, method, params }));
  return waitResp(id);
}
async function notif(method, params) {
  child.stdin.write(frame({ jsonrpc: '2.0', method, params }));
}

const R = {};
function rec(name, pass, detail = '') { R[name] = { pass, detail }; }

async function main() {
  child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { buf = Buffer.concat([buf, d]); q.push(...parseMsgs()); });

  const rootUri = `file://${FIXTURE}`;

  try {
    await new Promise(r => setTimeout(r, 2000));
    await req('initialize', {
      processId: process.pid, rootUri,
      capabilities: { textDocument: {
        hover: {}, completion: { completionItem: { snippetSupport: true } },
        definition: { linkSupport: true }, references: {}, rename: { prepareProvider: false },
        documentSymbol: { hierarchicalDocumentSymbolSupport: true },
        documentHighlight: {}, documentLink: { resolveProvider: false },
        foldingRange: {}, selectionRange: {}, semanticTokens: { full: true },
        inlayHint: {}, codeAction: {}, codeLens: {}, signatureHelp: { triggerCharacters: ['(', ','] },
        publishDiagnostics: {},
      }, workspace: { workspaceSymbol: true } },
    });
    await notif('initialized', {});

    // Open all files
    for (const [uri, text] of fileList)
      await notif('textDocument/didOpen', {
        textDocument: { uri, languageId: 'arkts', version: 1, text },
      });
    await new Promise(r => setTimeout(r, 2000));

    console.log('='.repeat(56));
    console.log('  ArkTS LSP — Feature Coverage Matrix (test-fixture)');
    console.log('='.repeat(56));

    // ═══ 1. Diagnostics ═══
    const diags = q.filter(m => m.method === 'textDocument/publishDiagnostics');
    const total = diags.reduce((s, d) => s + (d.params?.diagnostics?.length || 0), 0);
    const errs = diags.reduce((s, d) => s + (d.params?.diagnostics || []).filter(di => di.severity === 1).length, 0);
    rec('Diagnostics', diags.length > 0, `${diags.length} files, ${total} issues (${errs} errors)`);

    // ═══ 2. Document Symbols ═══
    try {
      const r = await req('textDocument/documentSymbol', { textDocument: { uri: indexUri } });
      const s = r.result || [];
      rec('DocSymbols', s.length >= 1 && s[0].children?.length >= 6,
        `${s[0]?.name || '?'} with ${s[0]?.children?.length || 0} children`);
    } catch (e) { rec('DocSymbols', false, e.message); }

    // ═══ 3. Workspace Symbols ═══
    try {
      const r = await req('workspace/symbol', { query: 'Todo' });
      rec('WorkspaceSym', (r.result || []).length >= 2, `${(r.result || []).length} symbols`);
    } catch (e) { rec('WorkspaceSym', false, e.message); }

    // ═══ 4. Completion: this. ═══
    try {
      const r = await req('textDocument/completion', {
        textDocument: { uri: indexUri }, position: { line: 22, character: 9 },
      });
      const items = (r.result?.items) || (r.result?.isIncomplete !== undefined ? [] : r.result || []);
      rec('Completion-this', items.length >= 4, `${items.length} items for this.`);
    } catch (e) { rec('Completion-this', false, e.message); }

    // ═══ 5. Completion: keywords ═══
    try {
      const r = await req('textDocument/completion', {
        textDocument: { uri: indexUri }, position: { line: 0, character: 0 },
      });
      const items = (r.result?.items) || (r.result?.isIncomplete !== undefined ? [] : r.result || []);
      rec('Completion-kw', items.length >= 10, `${items.length} keywords`);
    } catch (e) { rec('Completion-kw', false, e.message); }

    // ═══ 6. Hover: struct ═══
    try {
      const r = await req('textDocument/hover', {
        textDocument: { uri: indexUri }, position: { line: 5, character: 8 },
      });
      rec('Hover-struct', !!(r.result?.contents));
    } catch (e) { rec('Hover-struct', false, e.message); }

    // ═══ 7. Hover: @State field ═══
    try {
      const r = await req('textDocument/hover', {
        textDocument: { uri: indexUri }, position: { line: 6, character: 9 },
      });
      rec('Hover-State', !!(r.result?.contents));
    } catch (e) { rec('Hover-State', false, e.message); }

    // ═══ 8. Hover: @Provide field ═══
    try {
      const r = await req('textDocument/hover', {
        textDocument: { uri: indexUri }, position: { line: 9, character: 9 },
      });
      rec('Hover-Provide', !!(r.result?.contents));
    } catch (e) { rec('Hover-Provide', false, e.message); }

    // ═══ 9. Hover: @ComponentV2 ═══
    try {
      const r = await req('textDocument/hover', {
        textDocument: { uri: detailUri }, position: { line: 4, character: 1 },
      });
      rec('Hover-V2struct', !!(r.result?.contents));
    } catch (e) { rec('Hover-V2struct', false, e.message); }

    // ═══ 10. Hover: @Observed class ═══
    try {
      const r = await req('textDocument/hover', {
        textDocument: { uri: modelUri }, position: { line: 5, character: 13 },
      });
      rec('Hover-Observed', !!(r.result?.contents));
    } catch (e) { rec('Hover-Observed', false, e.message); }

    // ═══ 11. Definition: same-file ═══
    try {
      const r = await req('textDocument/definition', {
        textDocument: { uri: indexUri }, position: { line: 30, character: 18 },
      });
      const d = Array.isArray(r.result) ? r.result : [r.result];
      rec('Def-samefile', d.length > 0 && d[0].range.start.line === 6,
        `→ L${d[0]?.range?.start?.line + 1}`);
    } catch (e) { rec('Def-samefile', false, e.message); }

    // ═══ 12. Definition: cross-file import ═══
    try {
      const r = await req('textDocument/definition', {
        textDocument: { uri: indexUri }, position: { line: 1, character: 14 },
      });
      const d = Array.isArray(r.result) ? r.result : [r.result];
      rec('Def-crossfile', d.length > 0, `→ ${d[0]?.uri?.split('/').pop()}`);
    } catch (e) { rec('Def-crossfile', false, e.message); }

    // ═══ 13. References ═══
    try {
      const r = await req('textDocument/references', {
        textDocument: { uri: indexUri }, position: { line: 6, character: 9 },
        context: { includeDeclaration: true },
      });
      rec('References', (r.result || []).length >= 3, `${(r.result || []).length} refs`);
    } catch (e) { rec('References', false, e.message); }

    // ═══ 14. Rename ═══
    try {
      const r = await req('textDocument/rename', {
        textDocument: { uri: detailUri }, position: { line: 7, character: 8 },
        newName: 'counterValue',
      });
      rec('Rename', !!(r.result?.changes), `→ counterValue`);
    } catch (e) { rec('Rename', false, e.message); }

    // ═══ 15. Signature Help ═══
    try {
      const r = await req('textDocument/signatureHelp', {
        textDocument: { uri: indexUri }, position: { line: 49, character: 33 },
      });
      rec('SignatureHelp', !!(r.result?.signatures?.length > 0),
        r.result ? JSON.stringify(r.result).slice(0, 150) : 'null');
    } catch (e) { rec('SignatureHelp', false, e.message); }

    // ═══ 16. Code Actions ═══
    try {
      const r = await req('textDocument/codeAction', {
        textDocument: { uri: indexUri },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        context: { diagnostics: [] },
      });
      rec('CodeAction', Array.isArray(r.result), `${(r.result || []).length} actions`);
    } catch (e) { rec('CodeAction', false, e.message); }

    // ═══ 17. Code Lens ═══
    try {
      const r = await req('textDocument/codeLens', { textDocument: { uri: indexUri } });
      rec('CodeLens', (r.result || []).length >= 1, `${(r.result || []).length} lenses`);
    } catch (e) { rec('CodeLens', false, e.message); }

    // Code Lens — DetailPage (V2)
    try {
      const r = await req('textDocument/codeLens', { textDocument: { uri: detailUri } });
      rec('CodeLens-V2', (r.result || []).length >= 1, `${(r.result || []).length} lenses`);
    } catch (e) { rec('CodeLens-V2', false, e.message); }

    // ═══ 18. Semantic Tokens ═══
    try {
      const r = await req('textDocument/semanticTokens/full', { textDocument: { uri: detailUri } });
      rec('SemanticTokens', (r.result?.data || []).length > 0, `${(r.result?.data || []).length / 5} tokens`);
    } catch (e) { rec('SemanticTokens', false, e.message); }

    // ═══ 19. Document Highlights ═══
    try {
      const r = await req('textDocument/documentHighlight', {
        textDocument: { uri: indexUri }, position: { line: 22, character: 11 },
      });
      rec('DocHighlight', (r.result || []).length >= 2, `${(r.result || []).length} highlights`);
    } catch (e) { rec('DocHighlight', false, e.message); }

    // ═══ 20. Document Links ═══
    try {
      const r = await req('textDocument/documentLink', { textDocument: { uri: indexUri } });
      rec('DocLink', (r.result || []).length >= 2, `${(r.result || []).length} links`);
    } catch (e) { rec('DocLink', false, e.message); }

    // ═══ 21. Folding Ranges ═══
    try {
      const r = await req('textDocument/foldingRange', { textDocument: { uri: indexUri } });
      rec('FoldingRange', (r.result || []).length >= 3, `${(r.result || []).length} ranges`);
    } catch (e) { rec('FoldingRange', false, e.message); }

    // ═══ 22. Selection Ranges ═══
    try {
      const r = await req('textDocument/selectionRange', {
        textDocument: { uri: detailUri }, positions: [{ line: 10, character: 5 }],
      });
      rec('SelectionRange', (r.result || []).length > 0);
    } catch (e) { rec('SelectionRange', false, e.message); }

    // ═══ 23. Inlay Hints ═══
    try {
      const r = await req('textDocument/inlayHint', {
        textDocument: { uri: detailUri },
        range: { start: { line: 0, character: 0 }, end: { line: 40, character: 0 } },
      });
      rec('InlayHint', Array.isArray(r.result), `${(r.result || []).length} hints`);
    } catch (e) { rec('InlayHint', false, e.message); }

    // ═══ 24. Call Hierarchy ═══
    try {
      const r = await req('textDocument/prepareCallHierarchy', {
        textDocument: { uri: todoUri }, position: { line: 10, character: 10 },
      });
      const items = r.result || [];
      if (items.length > 0) {
        rec('CallHier-prepare', true, items[0].name);
        const r2 = await req('callHierarchy/incomingCalls', { item: items[0] });
        rec('CallHier-incoming', Array.isArray(r2.result), `${(r2.result || []).length} incoming`);
      } else {
        rec('CallHier-prepare', false, 'no callable item');
        rec('CallHier-incoming', false, 'N/A');
      }
    } catch (e) { rec('CallHier-prepare', false, e.message); }

    // ═══ 25. Type Hierarchy ═══
    try {
      const r = await req('textDocument/prepareTypeHierarchy', {
        textDocument: { uri: modelUri }, position: { line: 5, character: 13 },
      });
      const items = r.result || [];
      if (items.length > 0) {
        rec('TypeHier-prepare', true, items[0].name);
        const r2 = await req('typeHierarchy/supertypes', { item: items[0] });
        rec('TypeHier-super', Array.isArray(r2.result), `${(r2.result || []).length} supertypes`);
      } else {
        rec('TypeHier-prepare', false, 'no type item');
        rec('TypeHier-super', false, 'N/A');
      }
    } catch (e) { rec('TypeHier-prepare', false, e.message); }

    // ═══ 26. Definition: DetailPage cross-file ═══
    // MainPage imports DetailPage; test jump from import
    try {
      const r = await req('textDocument/definition', {
        textDocument: { uri: mainUri }, position: { line: 0, character: 14 },
      });
      const d = Array.isArray(r.result) ? r.result : [r.result];
      rec('Def-MainPage', d.length > 0, `→ ${d[0]?.uri?.split('/').pop()}`);
    } catch (e) { rec('Def-MainPage', false, e.message); }

    // ═══ 27. @Builder function hover ═══
    try {
      const r = await req('textDocument/hover', {
        textDocument: { uri: utilsUri }, position: { line: 5, character: 16 },
      });
      rec('Hover-BuilderFn', !!(r.result?.contents));
    } catch (e) { rec('Hover-BuilderFn', false, e.message); }

    // ═══ 28. EntryAbility hover ═══
    try {
      const r = await req('textDocument/hover', {
        textDocument: { uri: entryUri }, position: { line: 4, character: 14 },
      });
      rec('Hover-Entry', !!(r.result?.contents));
    } catch (e) { rec('Hover-Entry', false, e.message); }

    // Cleanup
    await notif('shutdown', {});
    await notif('exit', {});

  } catch (e) {
    console.error(`FATAL: ${e.message}\n${e.stack}`);
  } finally {
    child.kill();
  }

  // ─── Report ───
  console.log('\n' + '─'.repeat(56));
  let pass = 0, fail = [];
  for (const [n, r] of Object.entries(R)) {
    const icon = r.pass ? '✅' : '❌';
    console.log(`  ${icon} ${n.padEnd(22)} ${r.detail || ''}`);
    if (r.pass) pass++; else fail.push(n);
  }
  const tot = pass + fail.length;
  console.log('─'.repeat(56));
  console.log(`  Coverage: ${pass}/${tot} (${tot > 0 ? Math.round(pass / tot * 100) : 0}%)`);
  if (fail.length) console.log(`  Failed: ${fail.join(', ')}`);
  process.exit(fail.length ? 1 : 0);
}

main();
