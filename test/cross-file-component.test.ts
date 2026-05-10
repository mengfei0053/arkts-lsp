import { describe, it, expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { resolveImportedComponents, collectAvailableComponentNames, type ModuleResolver } from "../src/component-resolver.js";

function makeDoc(uri: string, source: string): TextDocument {
  return TextDocument.create(uri, "arkts", 0, source);
}

/**
 * In-memory module resolver for tests.
 * Matches `./relative/path` specifiers to documents by URI suffix.
 */
function createMockResolver(docs: TextDocument[]): ModuleResolver {
  return (_fromUri: string, specifier: string, _documents: TextDocument[]) => {
    // Normalize specifier: "./components/Card" → "components/Card"
    const normalized = specifier.replace(/^\.\//u, "");
    return docs.find((d) => d.uri.includes(normalized)) ?? null;
  };
}

// ─── resolveImportedComponents ──────────────────────────────────────────────

describe("resolveImportedComponents", () => {
  it("resolves imported @Component struct from another file", () => {
    const mainDoc = makeDoc("file:///project/pages/Index.ets", `
import { Card } from './components/Card';

@Entry
@Component
struct Index {
  build() {
    Card()
  }
}
`.trim());

    const cardDoc = makeDoc("file:///project/components/Card.ets", `
@Component
export struct Card {
  build() {
    Column() {
      Text('hello')
    }
  }
}
`.trim());

    const docs = [mainDoc, cardDoc];
    const results = resolveImportedComponents(mainDoc, docs, createMockResolver(docs));
    expect(results).toHaveLength(1);
    expect(results[0].localName).toBe("Card");
    expect(results[0].structName).toBe("Card");
    expect(results[0].isV2).toBe(false);
    expect(results[0].targetUri).toContain("Card.ets");
  });

  it("resolves imported @ComponentV2 struct", () => {
    const mainDoc = makeDoc("file:///project/pages/Index.ets", `
import { MyWidget } from './MyWidget';

@ComponentV2
struct Index {
  build() {
    MyWidget()
  }
}
`.trim());

    const widgetDoc = makeDoc("file:///project/MyWidget.ets", `
@ComponentV2
export struct MyWidget {
  @Local count: number = 0;
  build() {
    Text('widget')
  }
}
`.trim());

    const docs = [mainDoc, widgetDoc];
    const results = resolveImportedComponents(mainDoc, docs, createMockResolver(docs));
    expect(results).toHaveLength(1);
    expect(results[0].localName).toBe("MyWidget");
    expect(results[0].isV2).toBe(true);
  });

  it("handles aliased imports (as keyword)", () => {
    const mainDoc = makeDoc("file:///project/pages/Index.ets", `
import { Card as MyCard } from './components/Card';

@Component
struct Index {
  build() {
    MyCard()
  }
}
`.trim());

    const cardDoc = makeDoc("file:///project/components/Card.ets", `
@Component
export struct Card {
  build() {
    Text('card')
  }
}
`.trim());

    const docs = [mainDoc, cardDoc];
    const results = resolveImportedComponents(mainDoc, docs, createMockResolver(docs));
    expect(results).toHaveLength(1);
    expect(results[0].localName).toBe("MyCard");
    expect(results[0].importedName).toBe("Card");
    expect(results[0].structName).toBe("Card");
  });

  it("returns empty for non-component imports", () => {
    const mainDoc = makeDoc("file:///project/pages/Index.ets", `
import { helper } from './utils';

@Component
struct Index {
  build() {
    Column() { Text('hi') }
  }
}
`.trim());

    const utilsDoc = makeDoc("file:///project/utils.ets", `
export function helper(): string { return ''; }
`.trim());

    const docs = [mainDoc, utilsDoc];
    const results = resolveImportedComponents(mainDoc, docs, createMockResolver(docs));
    expect(results).toHaveLength(0);
  });

  it("handles multiple imports from same module", () => {
    const mainDoc = makeDoc("file:///project/pages/Index.ets", `
import { Card, Button } from './components/UI';

@Component
struct Index {
  build() {
    Column() {
      Card()
      Button()
    }
  }
}
`.trim());

    const uiDoc = makeDoc("file:///project/components/UI.ets", `
@Component
export struct Card {
  build() { Text('card') }
}

@Component
export struct Button {
  build() { Text('btn') }
}
`.trim());

    const docs = [mainDoc, uiDoc];
    const results = resolveImportedComponents(mainDoc, docs, createMockResolver(docs));
    expect(results).toHaveLength(2);
    const names = results.map((r) => r.localName).sort();
    expect(names).toEqual(["Button", "Card"]);
  });

  it("returns empty when target document not found", () => {
    const mainDoc = makeDoc("file:///project/pages/Index.ets", `
import { Card } from './nonexistent';

@Component
struct Index {
  build() {
    Column() { Text('hi') }
  }
}
`.trim());

    const results = resolveImportedComponents(mainDoc, [mainDoc], createMockResolver([mainDoc]));
    expect(results).toHaveLength(0);
  });
});

// ─── collectAvailableComponentNames ────────────────────────────────────────

describe("collectAvailableComponentNames", () => {
  it("combines local and imported components", () => {
    const mainDoc = makeDoc("file:///project/pages/Index.ets", `
import { Card } from './components/Card';

@Entry
@Component
struct Index {
  build() {
    Card()
  }
}

@Component
struct LocalWidget {
  build() { Text('local') }
}
`.trim());

    const cardDoc = makeDoc("file:///project/components/Card.ets", `
@Component
export struct Card {
  build() { Text('card') }
}
`.trim());

    const docs = [mainDoc, cardDoc];
    const results = collectAvailableComponentNames(mainDoc, docs, createMockResolver(docs));
    const names = results.map((r) => r.name).sort();
    expect(names).toContain("Card");
    expect(names).toContain("Index");
    expect(names).toContain("LocalWidget");

    const cardEntry = results.find((r) => r.name === "Card");
    expect(cardEntry?.source).toBe("imported");

    const indexEntry = results.find((r) => r.name === "Index");
    expect(indexEntry?.source).toBe("local");
  });
});
