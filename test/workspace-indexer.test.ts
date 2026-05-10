import { describe, it, expect, afterEach } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  indexDocument,
  indexWorkspace,
  removeDocumentFromIndex,
  findSymbolInWorkspace,
  clearWorkspaceIndex,
  getWorkspaceIndexEntry,
  getAllWorkspaceIndexEntries,
} from "../src/workspace-indexer.js";

function makeDoc(uri: string, source: string): TextDocument {
  return TextDocument.create(uri, "arkts", 0, source);
}

describe("workspace indexer", () => {
  afterEach(() => {
    clearWorkspaceIndex();
  });

  it("indexes a single document", () => {
    const doc = makeDoc("file:///test/Index.ets", `
@Component
struct Index {
  @State message: string = 'hello';
  build() { Text(this.message) }
}
`.trim());

    indexDocument(doc);
    const entry = getWorkspaceIndexEntry(doc.uri);
    expect(entry).toBeDefined();
    expect(entry!.symbols.some((s: { name: string }) => s.name === "Index")).toBe(true);
  });

  it("indexes multiple documents", () => {
    const docs = [
      makeDoc("file:///test/A.ets", "@Component struct A { build() { Text('a') } }"),
      makeDoc("file:///test/B.ets", "@Component struct B { build() { Button('b') } }"),
    ];

    const count = indexWorkspace(docs);
    expect(count).toBe(2);
    expect(getWorkspaceIndexEntry(docs[0].uri)).toBeDefined();
    expect(getWorkspaceIndexEntry(docs[1].uri)).toBeDefined();
  });

  it("finds symbol across workspace", () => {
    const docs = [
      makeDoc("file:///test/A.ets", "@Component struct Widget { build() { Text('a') } }"),
      makeDoc("file:///test/B.ets", "@Component struct Page { build() { Widget() } }"),
    ];

    indexWorkspace(docs);

    const results = findSymbolInWorkspace("Widget");
    expect(results).toHaveLength(1);
    expect(results[0].uri).toBe(docs[0].uri);
  });

  it("removes document from index", () => {
    const doc = makeDoc("file:///test/A.ets", "@Component struct A { build() {} }");
    indexDocument(doc);
    expect(getWorkspaceIndexEntry(doc.uri)).toBeDefined();

    removeDocumentFromIndex(doc.uri);
    expect(getWorkspaceIndexEntry(doc.uri)).toBeUndefined();
  });

  it("gets all indexed entries", () => {
    const docs = [
      makeDoc("file:///test/A.ets", "@Component struct A { build() {} }"),
      makeDoc("file:///test/B.ets", "@Component struct B { build() {} }"),
    ];

    indexWorkspace(docs);

    const all = getAllWorkspaceIndexEntries();
    expect(all).toHaveLength(2);
  });

  it("clears all indexed entries", () => {
    const doc = makeDoc("file:///test/A.ets", "@Component struct A { build() {} }");
    indexDocument(doc);
    clearWorkspaceIndex();
    expect(getAllWorkspaceIndexEntries()).toHaveLength(0);
  });
});
