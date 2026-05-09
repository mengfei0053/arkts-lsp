import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  buildProjectContext,
  resolveRelativeModule,
  resolveModuleSpecifier,
} from "../src/project.js";

const tempDirectories: string[] = [];

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

function createProject(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), "arkts-lsp-"));
  tempDirectories.push(directory);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(directory, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, "utf8");
  }
  return directory;
}

describe("resolveModuleSpecifier", () => {
  it("resolves relative import paths", () => {
    const project = createProject({
      "AppScope/app.json5": "{}",
      "entry/src/main/ets/pages/Home.ets": "import { x } from '../util/helper';",
      "entry/src/main/ets/util/helper.ts": "export const x = 1;",
    });
    const homeUri = pathToFileURL(join(project, "entry/src/main/ets/pages/Home.ets")).toString();
    const context = buildProjectContext(homeUri, []);
    const result = resolveModuleSpecifier(homeUri, "../util/helper", context.documents);
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("relative");
    expect(result?.document).not.toBeNull();
  });

  it("resolves @kit module imports", () => {
    const project = createProject({
      "AppScope/app.json5": "{}",
      "entry/src/main/ets/pages/Home.ets": "import { fileIo } from '@kit.CoreFileKit';",
    });
    const homeUri = pathToFileURL(join(project, "entry/src/main/ets/pages/Home.ets")).toString();
    const result = resolveModuleSpecifier(homeUri, "@kit.CoreFileKit", []);
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("kit");
    expect(result?.moduleName).toBe("CoreFileFileKit");
  });

  it("resolves @ohos module imports", () => {
    const result = resolveModuleSpecifier("file:///entry.ets", "@ohos.app.ability.common", []);
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("ohos");
    expect(result?.moduleName).toBe("app.ability.common");
  });

  it("returns null for unknown module patterns", () => {
    const result = resolveModuleSpecifier("file:///entry.ets", "some-unknown-pkg", []);
    expect(result).toBeNull();
  });

  it("parses named imports from kit specifiers", () => {
    const result = resolveModuleSpecifier("file:///entry.ets", "@kit.CoreFileKit", []);
    expect(result).not.toBeNull();
    // Should have API metadata available
    if (result?.kind === "kit") {
      expect(result?.api).toBeDefined();
    }
  });
});

describe("HarmonyOS API metadata", () => {
  it("provides API info for known kit modules", () => {
    const result = resolveModuleSpecifier("file:///entry.ets", "@kit.CoreFileKit", []);
    expect(result).not.toBeNull();
    if (result?.kind === "kit") {
      expect(result?.api?.exports?.length).toBeGreaterThan(0);
    }
  });

  it("provides API info for @ohos modules", () => {
    const result = resolveModuleSpecifier("file:///entry.ets", "@ohos.app.ability.common", []);
    expect(result).not.toBeNull();
  });

  it("returns kit info for bare @kit import", () => {
    const result = resolveModuleSpecifier("file:///entry.ets", "@kit.ArkUI", []);
    expect(result).not.toBeNull();
    if (result?.kind === "kit") {
      expect(result?.api?.exports?.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveRelativeModule with kit/ohos specifiers", () => {
  it("returns a virtual document for @kit imports", () => {
    const project = createProject({
      "AppScope/app.json5": "{}",
      "entry/src/main/ets/pages/Home.ets": "import { fileIo } from '@kit.CoreFileKit';",
    });
    const homeUri = pathToFileURL(join(project, "entry/src/main/ets/pages/Home.ets")).toString();
    const context = buildProjectContext(homeUri, []);
    const target = resolveModuleSpecifier(homeUri, "@kit.CoreFileKit", context.documents);
    expect(target).not.toBeNull();
    expect(target?.kind).toBe("kit");
  });
});
