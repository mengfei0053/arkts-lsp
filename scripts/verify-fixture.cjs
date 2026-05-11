// 快速验证：LSP 能否正常处理 test-fixture 项目
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVER = path.join(__dirname, '..', 'dist', 'index.js');
const FIXTURE = path.join(__dirname, '..', 'test-fixture');

let seq = 0, buffer = Buffer.alloc(0), queue = [];

function frame(msg) {
  const body = Buffer.from(JSON.stringify(msg), 'utf8');
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8'),
    body,
  ]);
}

function parseMessages() {
  const msgs = [];
  while (true) {
    const str = buffer.toString('utf8');
    const idx = str.indexOf('\r\n\r\n');
    if (idx === -1) break;
    const m = str.slice(0, idx).match(/Content-Length: (\d+)/i);
    if (!m) break;
    const len = parseInt(m[1], 10);
    const start = idx + 4;
    if (buffer.length < start + len) break;
    try { msgs.push(JSON.parse(buffer.slice(start, start + len).toString('utf8'))); }
    catch (e) {}
    buffer = buffer.slice(start + len);
  }
  return msgs;
}

function waitForResponse(id, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    function check() {
      const idx = queue.findIndex(m => m.id === id);
      if (idx !== -1) {
        const [msg] = queue.splice(idx, 1);
        if (msg.error) return reject(new Error(JSON.stringify(msg.error)));
        return resolve(msg);
      }
      if (Date.now() > deadline) return reject(new Error(`Timeout`));
      setTimeout(check, 50);
    }
    check();
  });
}

async function main() {
  const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { buffer = Buffer.concat([buffer, d]); queue.push(...parseMessages()); });

  const allFiles = [];
  function walk(dir, base) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, base);
      else if (entry.name.endsWith('.ets') || entry.name.endsWith('.ts')) {
        allFiles.push({ path: full, uri: `file://${full}`, content: fs.readFileSync(full, 'utf8') });
      }
    }
  }
  walk(FIXTURE, FIXTURE);

  console.log(`Found ${allFiles.length} source files:\n`);
  for (const f of allFiles) console.log(`  ${path.relative(FIXTURE, f.path)} (${f.content.split('\n').length} lines)`);

  try {
    await new Promise(r => setTimeout(r, 2000));

    // Init
    const init = await (() => {
      const id = ++seq;
      child.stdin.write(frame({ jsonrpc: '2.0', id, method: 'initialize',
        params: { processId: process.pid, rootUri: `file://${FIXTURE}`, capabilities: {} },
      }));
      return waitForResponse(id);
    })();

    const caps = init.result.capabilities;
    console.log(`\nServer initialized, caps: completion=${!!caps.completionProvider} def=${!!caps.definitionProvider}`);

    // initialized
    child.stdin.write(frame({ jsonrpc: '2.0', method: 'initialized', params: {} }));
    await new Promise(r => setTimeout(r, 500));

    // Open all files
    console.log(`\nOpening ${allFiles.length} files...`);
    for (const f of allFiles) {
      child.stdin.write(frame({
        jsonrpc: '2.0', method: 'textDocument/didOpen',
        params: { textDocument: { uri: f.uri, languageId: 'arkts', version: 1, text: f.content } },
      }));
    }
    await new Promise(r => setTimeout(r, 2000));

    // Collect diagnostics
    const diags = queue.filter(m => m.method === 'textDocument/publishDiagnostics');
    console.log(`\nDiagnostics from ${diags.length} files:`);
    let total = 0, totalErr = 0, totalWarn = 0;
    for (const d of diags) {
      const uri = d.params?.uri || '';
      const ds = d.params?.diagnostics || [];
      const errs = ds.filter(di => di.severity === 1).length;
      const warns = ds.filter(di => di.severity === 2).length;
      total += ds.length;
      totalErr += errs;
      totalWarn += warns;
      console.log(`  ${path.basename(uri)}: ${ds.length} issues (${errs} errors, ${warns} warnings)`);
      for (const di of ds.slice(0, 3)) {
        const sev = di.severity === 1 ? 'ERROR' : 'WARN';
        console.log(`    L${di.range.start.line + 1}: [${sev}] ${di.message}`);
      }
    }
    console.log(`\nTotal: ${total} issues (${totalErr} errors, ${totalWarn} warnings)`);

    // Document symbols for Index.ets
    const indexUri = `file://${path.join(FIXTURE, 'entry/src/main/ets/pages/Index.ets')}`;
    const symResp = await (() => {
      const id = ++seq;
      child.stdin.write(frame({ jsonrpc: '2.0', id, method: 'textDocument/documentSymbol',
        params: { textDocument: { uri: indexUri } },
      }));
      return waitForResponse(id);
    })();
    const syms = symResp.result || [];
    console.log(`\nDocument Symbols for Index.ets: ${syms.length} top-level`);
    for (const s of syms) {
      console.log(`  - [${s.kind}] ${s.name} (${s.detail || ''}) — ${(s.children || []).length} children`);
    }

    // Hover on @State field (previously buggy)
    console.log('\nHover on @State message...');
    const hov = await (() => {
      const id = ++seq;
      child.stdin.write(frame({ jsonrpc: '2.0', id, method: 'textDocument/hover',
        params: { textDocument: { uri: indexUri }, position: { line: 6, character: 9 } },
      }));
      return waitForResponse(id);
    })();
    console.log(`  ${hov.result ? '✅ Works!' : '❌ null'}`);
    if (hov.result) {
      const c = hov.result.contents;
      if (typeof c === 'string') console.log(`  Contents: ${c.slice(0, 100)}`);
      else if (c?.value) console.log(`  Contents: ${c.value.slice(0, 100)}`);
    }

    child.stdin.write(frame({ jsonrpc: '2.0', method: 'shutdown' }));
    child.stdin.write(frame({ jsonrpc: '2.0', method: 'exit' }));

  } catch(e) {
    console.error(`ERROR: ${e.message}`);
  } finally {
    child.kill();
  }
}

main();
