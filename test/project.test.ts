import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Position } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  collectDocumentSymbols,
  collectExportedSymbolLocations,
  findLinkedReferences,
  findDefinitions,
  findReferences,
  findReferencesWithOptions,
  getImportBindingAtPosition,
} from "../src/core.js";
import {
  buildProjectContext,
  collectWorkspaceProjectContexts,
  detectArkTSProjectRoot,
  isArkTSSourceFile,
  listProjectSourceFiles,
  listRelativeModuleSpecifiers,
  loadDocumentFromUri,
  resolveRelativeModule,
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

describe("project detection", () => {
  it("detects a HarmonyOS-style project root from a source file", () => {
    const project = createProject({
      "AppScope/app.json5": "{}",
      "hvigorfile.ts": "export default {};",
      "entry/src/main/ets/pages/Home.ets": "struct HomePage {}",
    });

    const filePath = join(project, "entry/src/main/ets/pages/Home.ets");
    expect(detectArkTSProjectRoot(filePath)).toBe(project);
  });

  it("lists ArkTS and TypeScript files while ignoring node_modules", () => {
    const project = createProject({
      "AppScope/app.json5": "{}",
      "hvigorfile.ts": "export default {};",
      "entry/src/main/ets/pages/Home.ets": "struct HomePage {}",
      "entry/src/main/ets/model/user.ts": "export interface User {}",
      "node_modules/pkg/index.ts": "export const ignored = true;",
    });

    const files = listProjectSourceFiles(project).map((file) => file.replace(`${project}/`, ""));

    expect(files).toEqual([
      "entry/src/main/ets/model/user.ts",
      "entry/src/main/ets/pages/Home.ets",
      "hvigorfile.ts",
    ]);
  });

  it("builds a project context that includes disk files not currently open", () => {
    const project = createProject({
      "AppScope/app.json5": "{}",
      "hvigorfile.ts": "export default {};",
      "entry/src/main/ets/pages/Home.ets": "import { helper } from '../util/helper';\nhelper();",
      "entry/src/main/ets/util/helper.ts": "export function helper() {}",
    });

    const homeUri = pathToFileURL(join(project, "entry/src/main/ets/pages/Home.ets")).toString();
    const openHome = TextDocument.create(homeUri, "arkts", 1, "import { helper } from '../util/helper';\nhelper();");

    const context = buildProjectContext(homeUri, [openHome]);

    expect(context.root).toBe(project);
    expect(context.documents).toHaveLength(3);
    expect(context.documents.some((document) => document.uri.endsWith("/helper.ts"))).toBe(true);
  });

  it("loads a file-backed document when it is not already open", () => {
    const project = createProject({
      "AppScope/app.json5": "{}",
      "hvigorfile.ts": "export default {};",
      "entry/src/main/ets/pages/Home.ets": "struct HomePage {}",
    });

    const homeUri = pathToFileURL(join(project, "entry/src/main/ets/pages/Home.ets")).toString();
    const document = loadDocumentFromUri(homeUri, []);

    expect(document).not.toBeNull();
    expect(document?.getText()).toContain("HomePage");
  });

  it("resolves a relative module to a project document", () => {
    const project = createProject({
      "AppScope/app.json5": "{}",
      "hvigorfile.ts": "export default {};",
      "entry/src/main/ets/pages/Home.ets": "import { helper } from '../util/helper';",
      "entry/src/main/ets/util/helper.ts": "export function helper() {}",
    });

    const homeUri = pathToFileURL(join(project, "entry/src/main/ets/pages/Home.ets")).toString();
    const helperUri = pathToFileURL(join(project, "entry/src/main/ets/util/helper.ts")).toString();
    const context = buildProjectContext(homeUri, []);

    const target = resolveRelativeModule(homeUri, "../util/helper", context.documents);

    expect(target?.uri).toBe(helperUri);
  });

  it("lists relative module specifiers for import completion", () => {
    const project = createProject({
      "AppScope/app.json5": "{}",
      "hvigorfile.ts": "export default {};",
      "entry/src/main/ets/pages/Home.ets": "import { helper } from '../util/helper';",
      "entry/src/main/ets/pages/Profile.ets": "struct ProfilePage {}",
      "entry/src/main/ets/util/helper.ts": "export function helper() {}",
    });

    const homeUri = pathToFileURL(join(project, "entry/src/main/ets/pages/Home.ets")).toString();
    const context = buildProjectContext(homeUri, []);

    const specifiers = listRelativeModuleSpecifiers(homeUri, "../", context.documents);

    expect(specifiers).toContain("../util/helper");
  });
});

describe("project-aware navigation", () => {
  it("resolves definitions across project files from indexed context", () => {
    const project = createProject({
      "AppScope/app.json5": "{}",
      "hvigorfile.ts": "export default {};",
      "entry/src/main/ets/pages/Home.ets": "import { helper } from '../util/helper';\nhelper();",
      "entry/src/main/ets/util/helper.ts": "export function helper() {}",
    });

    const homeUri = pathToFileURL(join(project, "entry/src/main/ets/pages/Home.ets")).toString();
    const home = TextDocument.create(homeUri, "arkts", 1, "import { helper } from '../util/helper';\nhelper();");
    const context = buildProjectContext(homeUri, [home]);

    const definitions = findDefinitions(
      {
        document: home,
        symbols: context.documents.flatMap((document) => collectDocumentSymbols(document)),
      },
      { line: 1, character: 2 },
    );

    expect(definitions.some((location) => location.uri.endsWith("/helper.ts"))).toBe(true);
  });

  it("resolves imported symbol definitions from the target module exports", () => {
    const project = createProject({
      "AppScope/app.json5": "{}",
      "hvigorfile.ts": "export default {};",
      "entry/src/main/ets/pages/Home.ets": "import { helper as loadHelper } from '../util/helper';\nloadHelper();",
      "entry/src/main/ets/util/helper.ts": "export function helper() {}\nexport const otherValue = 1;",
    });

    const homeUri = pathToFileURL(join(project, "entry/src/main/ets/pages/Home.ets")).toString();
    const home = TextDocument.create(homeUri, "arkts", 1, "import { helper as loadHelper } from '../util/helper';\nloadHelper();");
    const context = buildProjectContext(homeUri, [home]);

    const binding = getImportBindingAtPosition(home, Position.create(0, 20));
    const target = binding ? resolveRelativeModule(homeUri, binding.specifier, context.documents) : null;
    const exports = target ? collectExportedSymbolLocations(target).get(binding?.importedName ?? "") ?? [] : [];

    expect(binding?.importedName).toBe("helper");
    expect(binding?.localName).toBe("loadHelper");
    expect(target?.uri.endsWith("/helper.ts")).toBe(true);
    expect(exports).toHaveLength(1);
    expect(exports[0].uri.endsWith("/helper.ts")).toBe(true);
  });

  it("finds linked references across exported symbols and import aliases", () => {
    const project = createProject({
      "AppScope/app.json5": "{}",
      "hvigorfile.ts": "export default {};",
      "entry/src/main/ets/pages/Home.ets": "import { helper as loadHelper } from '../util/helper';\nloadHelper();",
      "entry/src/main/ets/pages/Profile.ets": "import { helper } from '../util/helper';\nhelper();",
      "entry/src/main/ets/util/helper.ts": "export function helper() {}\nhelper();",
    });

    const helperUri = pathToFileURL(join(project, "entry/src/main/ets/util/helper.ts")).toString();
    const helper = TextDocument.create(helperUri, "typescript", 1, "export function helper() {}\nhelper();");
    const context = buildProjectContext(helperUri, [helper]);

    const references = findLinkedReferences(
      context.documents,
      helper,
      { line: 0, character: 17 },
      true,
      (documentUri, specifier) => resolveRelativeModule(documentUri, specifier, context.documents),
    );

    expect(references).toHaveLength(6);
    expect(references.some((location) => location.uri.endsWith("/Home.ets") && location.range.start.line === 1)).toBe(true);
    expect(references.some((location) => location.uri.endsWith("/Profile.ets") && location.range.start.line === 1)).toBe(true);
  });

  it("finds references across files in the same project context", () => {
    const project = createProject({
      "AppScope/app.json5": "{}",
      "hvigorfile.ts": "export default {};",
      "entry/src/main/ets/pages/Home.ets": "import { helper } from '../util/helper';\nhelper();",
      "entry/src/main/ets/pages/Profile.ets": "helper();",
      "entry/src/main/ets/util/helper.ts": "export function helper() {}",
    });

    const helperUri = pathToFileURL(join(project, "entry/src/main/ets/util/helper.ts")).toString();
    const helper = TextDocument.create(helperUri, "typescript", 1, "export function helper() {}");
    const context = buildProjectContext(helperUri, [helper]);

    const references = findReferences(context.documents, helper, { line: 0, character: 17 });

    expect(references).toHaveLength(4);
  });

  it("skips import path strings and can exclude declarations in project references", () => {
    const project = createProject({
      "AppScope/app.json5": "{}",
      "hvigorfile.ts": "export default {};",
      "entry/src/main/ets/pages/Home.ets": "import { helper } from '../util/helper';\nhelper();",
      "entry/src/main/ets/pages/Profile.ets": "helper();",
      "entry/src/main/ets/util/helper.ts": "export function helper() {}",
    });

    const helperUri = pathToFileURL(join(project, "entry/src/main/ets/util/helper.ts")).toString();
    const helper = TextDocument.create(helperUri, "typescript", 1, "export function helper() {}");
    const context = buildProjectContext(helperUri, [helper]);

    const references = findReferencesWithOptions(context.documents, helper, { line: 0, character: 17 }, false);

    expect(references).toHaveLength(3);
  });

  it("collects unique workspace project contexts from open documents", () => {
    const project = createProject({
      "AppScope/app.json5": "{}",
      "hvigorfile.ts": "export default {};",
      "entry/src/main/ets/pages/Home.ets": "struct HomePage {}",
      "entry/src/main/ets/pages/Profile.ets": "struct ProfilePage {}",
    });

    const homeUri = pathToFileURL(join(project, "entry/src/main/ets/pages/Home.ets")).toString();
    const profileUri = pathToFileURL(join(project, "entry/src/main/ets/pages/Profile.ets")).toString();
    const contexts = collectWorkspaceProjectContexts([
      TextDocument.create(homeUri, "arkts", 1, "struct HomePage {}"),
      TextDocument.create(profileUri, "arkts", 1, "struct ProfilePage {}"),
    ]);

    expect(contexts).toHaveLength(1);
    expect(contexts[0].documents.length).toBeGreaterThanOrEqual(3);
  });
});

describe("isArkTSSourceFile", () => {
  it("recognizes .ets and .ts sources", () => {
    expect(isArkTSSourceFile("/tmp/a.ets")).toBe(true);
    expect(isArkTSSourceFile("/tmp/a.ts")).toBe(true);
    expect(isArkTSSourceFile("/tmp/a.js")).toBe(false);
  });
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
