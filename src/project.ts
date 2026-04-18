import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TextDocument } from "vscode-languageserver-textdocument";

const projectRootMarkers = [
  "AppScope/app.json5",
  "hvigorfile.ts",
  "build-profile.json5",
  "oh-package.json5",
];

const ignoredDirectories = new Set([".git", "node_modules", "dist", "build", ".hvigor"]);

export type ProjectContext = {
  root: string | null;
  documents: TextDocument[];
};

export function detectArkTSProjectRoot(filePath: string): string | null {
  let current = resolve(dirname(filePath));

  while (true) {
    if (projectRootMarkers.some((marker) => existsSync(join(current, marker)))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function isArkTSSourceFile(filePath: string): boolean {
  const extension = extname(filePath).toLowerCase();
  return extension === ".ets" || extension === ".ts";
}

export function listProjectSourceFiles(root: string): string[] {
  const results: string[] = [];
  walkDirectory(root, results);
  return results.sort();
}

export function buildProjectContext(sourceUri: string, openDocuments: TextDocument[]): ProjectContext {
  if (!sourceUri.startsWith("file://")) {
    return { root: null, documents: openDocuments };
  }

  const sourcePath = fileURLToPath(sourceUri);
  const root = detectArkTSProjectRoot(sourcePath);
  if (!root) {
    return { root: null, documents: openDocuments };
  }

  const openDocumentMap = new Map(openDocuments.map((document) => [document.uri, document]));
  const documents = listProjectSourceFiles(root).map((filePath) => {
    const uri = pathToFileURL(filePath).toString();
    const openDocument = openDocumentMap.get(uri);
    if (openDocument) {
      return openDocument;
    }

    return TextDocument.create(uri, languageIdForPath(filePath), 0, readFileSync(filePath, "utf8"));
  });

  return { root, documents };
}

export function collectWorkspaceProjectContexts(openDocuments: TextDocument[]): ProjectContext[] {
  const roots = new Set<string>();
  const contexts: ProjectContext[] = [];

  for (const document of openDocuments) {
    if (!document.uri.startsWith("file://")) {
      continue;
    }

    const root = detectArkTSProjectRoot(fileURLToPath(document.uri));
    if (!root || roots.has(root)) {
      continue;
    }

    roots.add(root);
    contexts.push(buildProjectContext(document.uri, openDocuments));
  }

  if (contexts.length === 0) {
    contexts.push({ root: null, documents: openDocuments });
  }

  return contexts;
}

export function loadDocumentFromUri(uri: string, openDocuments: TextDocument[]): TextDocument | null {
  const openDocument = openDocuments.find((document) => document.uri === uri);
  if (openDocument) {
    return openDocument;
  }

  if (!uri.startsWith("file://")) {
    return null;
  }

  const filePath = fileURLToPath(uri);
  if (!existsSync(filePath) || !isArkTSSourceFile(filePath)) {
    return null;
  }

  return TextDocument.create(uri, languageIdForPath(filePath), 0, readFileSync(filePath, "utf8"));
}

function walkDirectory(current: string, results: string[]): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const fullPath = join(current, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        walkDirectory(fullPath, results);
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (isArkTSSourceFile(fullPath)) {
      results.push(fullPath);
    }
  }
}

function languageIdForPath(filePath: string): string {
  return extname(filePath).toLowerCase() === ".ets" ? "arkts" : "typescript";
}
