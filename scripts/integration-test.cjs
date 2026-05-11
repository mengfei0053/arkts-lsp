// LSP 集成测试 v5 — 全功能验证：补全/跳转/符号/Hover/诊断
const { spawn } = require('child_process');
const path = require('path');

const SERVER = path.join(__dirname, '..', 'dist', 'index.js');
const TEST_FILE = 'file:///test/EntryAbility.ets';

const TEST_CONTENT = `@Entry
@Component
struct Index {
  @State message: string = 'Hello ArkTS';
  @Prop count: number = 0;

  aboutToAppear() {
    this.message = 'ready';
  }

  build() {
    Column() {
      Text(this.message)
        .fontSize(20)
      Button('Click')
        .onClick(() => {
          this.count++;
        })
    }
  }
}
`;

let seq = 0, buffer = Buffer.alloc(0);

function frame(msg) {
  const body = Buffer.from(JSON.stringify(msg), 'utf8');
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8'),
    body,
  ]);
}

function readMessages() {
  const msgs = [];
  while (true) {
    const str = buffer.toString('utf8');
    const idx = str.indexOf('\r\n\r\n');
    if (idx === -1) break;
    const match = str.slice(0, idx).match(/Content-Length: (\d+)/i);
    if (!match) break;
    const len = parseInt(match[1], 10);
    const start = idx + 4;
    if (buffer.length < start + len) break;
    try {
      msgs.push(JSON.parse(buffer.slice(start, start + len).toString('utf8')));
    } catch (e) { process.stderr.write(`[parse] ${e}\n`); }
    buffer = buffer.slice(start + len);
  }
  return msgs;
}

async function main() {
  const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
  let queue = [];

  child.stdout.on('data', d => { buffer = Buffer.concat([buffer, d]); queue.push(...readMessages()); });
  child.stderr.on('data', d => {}); // suppress server logs

  function send(msg) {
    return new Promise(resolve => child.stdin.write(frame(msg), resolve));
  }

  function waitForResponse(id, timeout = 6000) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeout;
      function check() {
        const idx = queue.findIndex(m => m.id === id);
        if (idx !== -1) {
          const [msg] = queue.splice(idx, 1);
          if (msg.error) return reject(new Error(`LSP error: ${JSON.stringify(msg.error)}`));
          return resolve(msg);
        }
        if (Date.now() > deadline) return reject(new Error(`Timeout id=${id}`));
        setTimeout(check, 50);
      }
      check();
    });
  }

  async function request(method, params) {
    const id = ++seq;
    await send({ jsonrpc: '2.0', id, method, params });
    return waitForResponse(id);
  }

  const results = {};
  let failed = [];

  try {
    await new Promise(r => setTimeout(r, 1500));

    // Init
    await request('initialize', {
      processId: process.pid, rootUri: 'file:///test',
      capabilities: { textDocument: {
        hover: {}, completion: { completionItem: { snippetSupport: true } },
        definition: { linkSupport: true },
        documentSymbol: { hierarchicalDocumentSymbolSupport: true },
      }},
    });
    await send({ jsonrpc: '2.0', method: 'initialized', params: {} });
    await new Promise(r => setTimeout(r, 400));

    // Open
    await send({
      jsonrpc: '2.0', method: 'textDocument/didOpen',
      params: { textDocument: { uri: TEST_FILE, languageId: 'arkts', version: 1, text: TEST_CONTENT } },
    });
    await new Promise(r => setTimeout(r, 600));

    console.log('=== ArkTS LSP Integration Test ===\n');

    // ─── Doc Symbols ───
    console.log('1. Document Symbols');
    const sym = await request('textDocument/documentSymbol', { textDocument: { uri: TEST_FILE } });
    const syms = sym.result || [];
    const symOK = syms.length === 1 && syms[0].name === 'Index' && syms[0].children.length >= 2;
    results.symbols = symOK;
    console.log(`   ${symOK ? '✅' : '❌'} Index + ${syms[0]?.children?.length || 0} children`);

    // ─── Completion: this. ───
    console.log('2. Completion (this.)');
    const comp = await request('textDocument/completion', {
      textDocument: { uri: TEST_FILE }, position: { line: 7, character: 9 },
    });
    const items = (comp.result?.items) || (comp.result?.isIncomplete !== undefined ? [] : comp.result || []);
    const hasMsg = items.some(i => i.label === 'message');
    const hasCount = items.some(i => i.label === 'count');
    results.completion = items.length >= 4 && hasMsg && hasCount;
    console.log(`   ${results.completion ? '✅' : '❌'} ${items.length} items (message:${hasMsg}, count:${hasCount})`);

    // ─── Definition: Text → @State ───
    console.log('3. Definition (Text→@State)');
    const def1 = await request('textDocument/definition', {
      textDocument: { uri: TEST_FILE }, position: { line: 12, character: 16 },
    });
    const d1 = (def1.result || []);
    const defs1 = Array.isArray(d1) ? d1 : [d1];
    results.def1 = defs1.length >= 1 && defs1[0].range.start.line === 3;
    console.log(`   ${results.def1 ? '✅' : '❌'} → L${defs1[0]?.range?.start?.line + 1} (expected L4)`);

    // ─── Definition: assignment → @State ───
    console.log('4. Definition (assign→@State)');
    const def2 = await request('textDocument/definition', {
      textDocument: { uri: TEST_FILE }, position: { line: 7, character: 12 },
    });
    const d2 = (def2.result || []);
    const defs2 = Array.isArray(d2) ? d2 : [d2];
    results.def2 = defs2.length >= 1 && defs2[0].range.start.line === 3;
    console.log(`   ${results.def2 ? '✅' : '❌'} → L${defs2[0]?.range?.start?.line + 1} (expected L4)`);

    // ─── Hover: struct ───
    console.log('5. Hover (struct Index)');
    const hov1 = await request('textDocument/hover', {
      textDocument: { uri: TEST_FILE }, position: { line: 2, character: 8 },
    });
    results.hoverStruct = !!(hov1.result?.contents);
    console.log(`   ${results.hoverStruct ? '✅' : '❌'} ${typeof hov1.result?.contents}`);

    // ─── Hover: @State field ───
    console.log('6. Hover (@State message)');
    try {
      const hov2 = await request('textDocument/hover', {
        textDocument: { uri: TEST_FILE }, position: { line: 3, character: 9 },
      });
      results.hoverState = !!(hov2.result?.contents);
      console.log(`   ${results.hoverState ? '✅' : '❌'} ${typeof hov2.result?.contents}`);
    } catch(e) {
      results.hoverState = false;
      console.log(`   ❌ TIMEOUT — confirm bug still exists`);
    }

    // ─── Hover: normal field (no decorator) ───
    // Test on "this.message" usage to trigger hover
    console.log('7. Hover (this.message usage)');
    try {
      const hov3 = await request('textDocument/hover', {
        textDocument: { uri: TEST_FILE }, position: { line: 7, character: 12 },
      });
      results.hoverUsage = !!(hov3.result?.contents);
      console.log(`   ${results.hoverUsage ? '✅' : '❌'} ${typeof hov3.result?.contents}`);
    } catch(e) {
      results.hoverUsage = false;
      console.log(`   ❌ TIMEOUT`);
    }

    // ─── Diagnostics ───
    console.log('8. Diagnostics');
    // Collect any publishDiagnostics from the queue
    const diags = queue.filter(m => m.method === 'textDocument/publishDiagnostics');
    results.diagnostics = diags.length > 0;
    const diagCount = diags.reduce((s, d) => s + (d.params?.diagnostics?.length || 0), 0);
    console.log(`   ${results.diagnostics ? '✅' : '❌'} ${diagCount} diagnostic(s)`);

    // ─── Summary ───
    console.log('\n=== Summary ===');
    for (const [k, v] of Object.entries(results)) {
      console.log(`  ${k.padEnd(16)}: ${v ? '✅' : '❌'}`);
    }
    const allPass = Object.values(results).every(Boolean);
    console.log(`\n${allPass ? '✅ ALL PASS' : '⚠️  SOME FAILED'}`);

    await send({ jsonrpc: '2.0', method: 'shutdown' });
    await send({ jsonrpc: '2.0', method: 'exit' });
  } finally {
    child.kill();
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
