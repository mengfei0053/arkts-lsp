import { describe, expect, it } from "vitest";
import { spawn, ChildProcess } from "child_process";
import { join } from "path";

// Minimal LSP client that communicates over stdio
function createLSPClient(): { send: (msg: object) => void; request: (method: string, params: object, id: number) => Promise<any>; close: () => void } {
  const serverPath = join(process.cwd(), "src", "index.ts");
  const proc = spawn("npx", ["tsx", serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: process.cwd(),
  });

  let buffer = "";
  let messageId = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (err: any) => void }>();

  proc.stdout!.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) break;
      const header = buffer.slice(0, headerEnd);
      const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!contentLengthMatch) break;
      const contentLength = parseInt(contentLengthMatch[1], 10);
      const bodyStart = headerEnd + 4;
      if (buffer.length < bodyStart + contentLength) break;
      const body = buffer.slice(bodyStart, bodyStart + contentLength);
      buffer = buffer.slice(bodyStart + contentLength);
      try {
        const msg = JSON.parse(body);
        if (msg.id !== undefined && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id)!;
          pending.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      } catch { /* ignore parse errors */ }
    }
  });

  function send(msg: object) {
    const body = JSON.stringify(msg);
    const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
    proc.stdin!.write(header + body);
  }

  async function request(method: string, params: object, id: number): Promise<any> {
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send({ jsonrpc: "2.0", id, method, params });
    });
  }

  function close() {
    proc.kill();
  }

  return { send, request, close };
}

const TEST_URI = "file:///tmp/test-arkts-project/Index.ets";
const TEST_CODE = [
  "@Entry",
  "@Component",
  "struct Index {",
  "  @State message: string = 'Hello World'",
  "  @State count: number = 0",
  "  build() {",
  "    Column() {",
  "      Text(this.message)",
  "    }",
  "  }",
  "}",
].join("\n");

describe("LSP e2e protocol integration", () => {
  it("returns folding ranges via onFoldingRanges", async () => {
    const client = createLSPClient();

    try {
      // Initialize
      await client.request("initialize", {
        processId: null,
        rootUri: null,
        capabilities: {},
      }, 1);

      // Open document
      client.send({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: {
          textDocument: { uri: TEST_URI, languageId: "arkts", version: 1, text: TEST_CODE },
        },
      });

      // Wait a bit for document to be indexed
      await new Promise(r => setTimeout(r, 200));

      // Request folding ranges
      const ranges = await client.request("textDocument/foldingRange", {
        textDocument: { uri: TEST_URI },
      }, 2);

      expect(Array.isArray(ranges)).toBe(true);
      expect(ranges.length).toBeGreaterThan(0);

      // Should have at least: struct body (L2-L10), build body (L5-L9), Column body (L6-L8)
      const startLines = ranges.map((r: any) => r.startLine);
      expect(startLines).toContain(2); // struct Index body
    } finally {
      client.close();
    }
  }, 10000);
});
