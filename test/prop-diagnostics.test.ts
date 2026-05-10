import { describe, it, expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { validateComponentCallProps } from "../src/prop-diagnostics.js";
import { Diagnostic } from "vscode-languageserver/node.js";

function makeDoc(uri: string, source: string): TextDocument {
  return TextDocument.create(uri, "arkts", 0, source);
}

function createMockResolver(docs: TextDocument[]) {
  return (_fromUri: string, specifier: string, _documents: TextDocument[]) => {
    const normalized = specifier.replace(/^\.\//u, "");
    return docs.find((d) => d.uri.includes(normalized)) ?? null;
  };
}

describe("validateComponentCallProps", () => {
  it("warns on unknown prop passed to imported component", () => {
    const mainDoc = makeDoc("file:///project/pages/Index.ets", `
import { Card } from './components/Card';

@Component
struct Index {
  build() {
    Card({ title: 'hello', unknownProp: 42 })
  }
}
`.trim());

    const cardDoc = makeDoc("file:///project/components/Card.ets", `
@Component
export struct Card {
  @Prop title: string = '';

  build() { Text(this.title) }
}
`.trim());

    const docs = [mainDoc, cardDoc];
    const diagnostics: Diagnostic[] = [];
    validateComponentCallProps(mainDoc, docs, diagnostics, 10, createMockResolver(docs));

    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain("unknownProp");
  });

  it("warns on missing required prop (no default value)", () => {
    const mainDoc = makeDoc("file:///project/pages/Index.ets", `
import { Card } from './components/Card';

@Component
struct Index {
  build() {
    Card({})
  }
}
`.trim());

    const cardDoc = makeDoc("file:///project/components/Card.ets", `
@Component
export struct Card {
  @Prop title: string = '';
  @Link count: number;

  build() { Text(this.title) }
}
`.trim());

    const docs = [mainDoc, cardDoc];
    const diagnostics: Diagnostic[] = [];
    validateComponentCallProps(mainDoc, docs, diagnostics, 10, createMockResolver(docs));

    const missingDiags = diagnostics.filter((d) => d.message.includes("count"));
    expect(missingDiags.length).toBeGreaterThanOrEqual(1);
    expect(missingDiags[0].message).toContain("Required");
  });

  it("passes when all required props are provided", () => {
    const mainDoc = makeDoc("file:///project/pages/Index.ets", `
import { Card } from './components/Card';

@Component
struct Index {
  build() {
    Card({ title: 'hi', count: this.count })
  }
}
`.trim());

    const cardDoc = makeDoc("file:///project/components/Card.ets", `
@Component
export struct Card {
  @Prop title: string = '';
  @Link count: number;

  build() { Text(this.title) }
}
`.trim());

    const docs = [mainDoc, cardDoc];
    const diagnostics: Diagnostic[] = [];
    validateComponentCallProps(mainDoc, docs, diagnostics, 10, createMockResolver(docs));

    expect(diagnostics).toHaveLength(0);
  });

  it("warns on unknown prop for local component", () => {
    const doc = makeDoc("file:///project/pages/Index.ets", `
@Component
struct Card {
  @Prop title: string = '';

  build() { Text(this.title) }
}

@Entry
@Component
struct Index {
  build() {
    Card({ title: 'hi', bogus: true })
  }
}
`.trim());

    const diagnostics: Diagnostic[] = [];
    validateComponentCallProps(doc, [doc], diagnostics, 10);

    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain("bogus");
  });

  it("no warnings for built-in components", () => {
    const doc = makeDoc("file:///project/pages/Index.ets", `
@Component
struct Index {
  build() {
    Text('hello')
    Column() { Button('click') }
  }
}
`.trim());

    const diagnostics: Diagnostic[] = [];
    validateComponentCallProps(doc, [doc], diagnostics, 10);

    expect(diagnostics).toHaveLength(0);
  });

  it("handles V2 @Param/@Event props", () => {
    const mainDoc = makeDoc("file:///project/pages/Index.ets", `
import { Widget } from './Widget';

@ComponentV2
struct Index {
  build() {
    Widget({ label: 'hi', wrongProp: 1 })
  }
}
`.trim());

    const widgetDoc = makeDoc("file:///project/Widget.ets", `
@ComponentV2
export struct Widget {
  @Param label: string = '';
  @Event onChange: () => void = () => {};

  build() { Text(this.label) }
}
`.trim());

    const docs = [mainDoc, widgetDoc];
    const diagnostics: Diagnostic[] = [];
    validateComponentCallProps(mainDoc, docs, diagnostics, 10, createMockResolver(docs));

    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain("wrongProp");
  });
});
