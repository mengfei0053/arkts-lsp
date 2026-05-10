import { describe, it, expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  prepareCallHierarchy,
  incomingCalls,
  outgoingCalls,
} from "../src/call-hierarchy.js";
import { SymbolKind } from "vscode-languageserver/node.js";

function makeDoc(uri: string, source: string): TextDocument {
  return TextDocument.create(uri, "arkts", 0, source);
}

describe("call hierarchy", () => {
  it("prepares call hierarchy for a method at position", () => {
    const doc = makeDoc("file:///test/Index.ets", `@Component
struct Index {
  @State message: string = '';
  onClick() {
    this.message = 'clicked';
  }
  build() {
    Text(this.message);
  }
}`);

    // onClick at line 3 (0-based: @Component=0, struct=1, @State=2, onClick=3)
    const result = prepareCallHierarchy(doc, { line: 3, character: 4 });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("onClick");
    expect(result[0].kind).toBe(SymbolKind.Method);
  });

  it("returns empty for position not on a method", () => {
    const doc = makeDoc("file:///test/Index.ets", `@Component struct A { build() { Text('hi') } }`);
    const result = prepareCallHierarchy(doc, { line: 0, character: 0 });
    expect(result).toHaveLength(0);
  });

  it("finds incoming calls from other methods", () => {
    const mainDoc = makeDoc("file:///test/Index.ets", `@Component
struct Index {
  onClick() {
    console.log('clicked');
  }
  build() {
    this.onClick();
  }
}`);

    const items = prepareCallHierarchy(mainDoc, { line: 2, character: 4 });
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("onClick");

    const callers = incomingCalls(items[0], [mainDoc]);
    const callerNames = callers.map((c) => c.from.name);
    expect(callerNames).toContain("build");
  });

  it("finds outgoing calls from a method", () => {
    const doc = makeDoc("file:///test/Index.ets", `@Component
struct Index {
  validate() {
    return true;
  }
  onSubmit() {
    this.validate();
  }
  build() {
    Text('hi');
  }
}`);

    const items = prepareCallHierarchy(doc, { line: 5, character: 4 });
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("onSubmit");

    const callees = outgoingCalls(items[0], [doc]);
    const calleeNames = callees.map((c) => c.to.name);
    expect(calleeNames).toContain("validate");
  });
});
