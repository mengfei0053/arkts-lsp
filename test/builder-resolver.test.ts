import { describe, it, expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { resolveImportedBuilders, lookupImportedBuilder } from "../src/builder-resolver.js";
import { ModuleResolver } from "../src/component-resolver.js";

function makeDoc(uri: string, source: string): TextDocument {
  return TextDocument.create(uri, "arkts", 0, source);
}

function createMockResolver(docs: TextDocument[]): ModuleResolver {
  return (_fromUri: string, specifier: string, _documents: TextDocument[]) => {
    const normalized = specifier.replace(/^\.\//u, "");
    return docs.find((d) => d.uri.includes(normalized)) ?? null;
  };
}

describe("resolveImportedBuilders", () => {
  it("resolves imported @Builder function", () => {
    const mainDoc = makeDoc("file:///project/pages/Index.ets", `
import { cardBuilder } from './builders/CardBuilder';

@Component
struct Index {
  build() {
    cardBuilder()
  }
}
`.trim());

    const builderDoc = makeDoc("file:///project/builders/CardBuilder.ets", `
@Builder
export function cardBuilder() {
  Text('card')
}
`.trim());

    const docs = [mainDoc, builderDoc];
    const result = resolveImportedBuilders(mainDoc, docs, createMockResolver(docs));

    expect(result).toHaveLength(1);
    expect(result[0].localName).toBe("cardBuilder");
    expect(result[0].targetUri).toContain("CardBuilder");
  });

  it("resolves @Builder inside exported struct", () => {
    const mainDoc = makeDoc("file:///project/pages/Index.ets", `
import { Card } from './components/Card';

@Component
struct Index {
  build() {
    Card({ builder: this.itemBuilder })
  }

  @Builder
  itemBuilder() {
    Text('item')
  }
}
`.trim());

    const cardDoc = makeDoc("file:///project/components/Card.ets", `
@Component
export struct Card {
  @BuilderParam builder: () => void;

  build() {
    this.builder()
  }
}
`.trim());

    const docs = [mainDoc, cardDoc];
    const result = resolveImportedBuilders(mainDoc, docs, createMockResolver(docs));

    // cardDoc has no @Builder functions at module level
    // but the struct has @BuilderParam — that's a separate feature
    expect(result).toHaveLength(0);
  });

  it("resolves aliased import", () => {
    const mainDoc = makeDoc("file:///project/pages/Index.ets", `
import { cardBuilder as myBuilder } from './builders';

@Component
struct Index {
  build() {
    myBuilder()
  }
}
`.trim());

    const builderDoc = makeDoc("file:///project/builders.ets", `
@Builder
export function cardBuilder() {
  Text('card')
}
`.trim());

    const docs = [mainDoc, builderDoc];
    const result = resolveImportedBuilders(mainDoc, docs, createMockResolver(docs));

    expect(result).toHaveLength(1);
    expect(result[0].localName).toBe("myBuilder");
    expect(result[0].importedName).toBe("cardBuilder");
  });

  it("returns empty for no @Builder imports", () => {
    const mainDoc = makeDoc("file:///project/pages/Index.ets", `
import { SomeType } from './types';

@Component
struct Index {
  build() { Text('hi') }
}
`.trim());

    const typesDoc = makeDoc("file:///project/types.ets", `
export type SomeType = string;
`.trim());

    const docs = [mainDoc, typesDoc];
    const result = resolveImportedBuilders(mainDoc, docs, createMockResolver(docs));

    expect(result).toHaveLength(0);
  });
});

describe("lookupImportedBuilder", () => {
  it("finds builder by local name", () => {
    const builders = [
      { localName: "cardBuilder", importedName: "cardBuilder", targetUri: "file:///a.ets", targetLine: 1, structName: "", isGlobal: true, parameters: [] },
    ];

    const found = lookupImportedBuilder("cardBuilder", builders);
    expect(found?.localName).toBe("cardBuilder");
  });

  it("returns undefined for unknown name", () => {
    const found = lookupImportedBuilder("unknown", []);
    expect(found).toBeUndefined();
  });
});
