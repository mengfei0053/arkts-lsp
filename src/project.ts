import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TextDocument } from "vscode-languageserver-textdocument";

const projectRootMarkers = [
  "AppScope/app.json5",
  "hvigorfile.ts",
  "build-profile.json5",
  "oh-package.json5",
];

const ignoredDirectories = new Set([".git", "node_modules", "dist", "build", ".hvigor"]);
const resolvableExtensions = [".ets", ".ts", ".d.ts"];

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

export function resolveRelativeModule(
  fromUri: string,
  specifier: string,
  documents: TextDocument[],
): TextDocument | null {
  if (!fromUri.startsWith("file://") || !specifier.startsWith(".")) {
    return null;
  }

  const sourcePath = fileURLToPath(fromUri);
  const sourceDirectory = dirname(sourcePath);
  const candidateBase = resolve(sourceDirectory, specifier);
  const documentMap = new Map(documents.map((document) => [document.uri, document]));

  for (const filePath of buildModuleCandidates(candidateBase)) {
    const uri = pathToFileURL(filePath).toString();
    const openDocument = documentMap.get(uri);
    if (openDocument) {
      return openDocument;
    }
    if (existsSync(filePath) && isArkTSSourceFile(filePath)) {
      return TextDocument.create(uri, languageIdForPath(filePath), 0, readFileSync(filePath, "utf8"));
    }
  }

  return null;
}

export function listRelativeModuleSpecifiers(
  fromUri: string,
  prefix: string,
  documents: TextDocument[],
): string[] {
  if (!fromUri.startsWith("file://")) {
    return [];
  }

  const sourcePath = fileURLToPath(fromUri);
  const sourceDirectory = dirname(sourcePath);
  const currentPrefix = prefix || ".";
  const normalizedPrefix = currentPrefix.replace(/\\/gu, "/");

  const specifiers = new Set<string>();

  for (const document of documents) {
    if (!document.uri.startsWith("file://") || document.uri === fromUri) {
      continue;
    }

    const targetPath = fileURLToPath(document.uri);
    const relativePath = relative(sourceDirectory, targetPath).split(sep).join("/");
    const withoutExtension = stripModuleExtension(relativePath);
    const candidate = withoutExtension.startsWith(".") ? withoutExtension : `./${withoutExtension}`;

    if (candidate.startsWith(normalizedPrefix)) {
      specifiers.add(candidate);
    }
  }

  return [...specifiers].sort();
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

function buildModuleCandidates(candidateBase: string): string[] {
  const candidates = new Set<string>();

  if (extname(candidateBase)) {
    candidates.add(candidateBase);
  }

  for (const extension of resolvableExtensions) {
    candidates.add(`${candidateBase}${extension}`);
    candidates.add(join(candidateBase, `index${extension}`));
  }

  return [...candidates];
}

function stripModuleExtension(filePath: string): string {
  for (const extension of resolvableExtensions) {
    if (filePath.endsWith(extension)) {
      return filePath.slice(0, -extension.length);
    }
  }

  return filePath;
}
