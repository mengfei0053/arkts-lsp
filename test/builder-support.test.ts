import { describe, expect, it } from "vitest";
import { Position } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { buildHover, buildLinkedHover } from "../src/core.js";
import {
  buildCompletionItems,
  buildClassMemberCompletionItems,
  getMemberAccessContextAtPosition,
  getEnclosingTypeContextAtPosition,
} from "../src/core.js";

function makeDocument(uri: string, text: string): TextDocument {
  return TextDocument.create(uri, "arkts", 1, text);
}

describe("@Builder hover support", () => {
  it("shows @Builder info when hovering over a builder method call", () => {
    const document = makeDocument(
      "file:///home.ets",
      [
        "@Component",
        "struct HomePage {",
        "  @Builder",
        "  myHeader() {",
        "    Text('header');",
        "  }",
        "  build() {",
        "    this.myHeader();",
        "  }",
        "}",
      ].join("\n"),
    );

    const hover = buildHover(document, Position.create(7, 10));
    expect(hover).not.toBeNull();
    const contents = typeof hover?.contents === "object" && "value" in hover.contents ? hover.contents.value : "";
    expect(contents).toContain("@Builder");
    expect(contents).toContain("myHeader");
  });

  it("describes @BuilderParam fields in hover output", () => {
    const document = makeDocument(
      "file:///card.ets",
      [
        "struct CustomCard {",
        "  @BuilderParam headerBuilder: () => void;",
        "  build() {",
        "    this.headerBuilder();",
        "  }",
        "}",
      ].join("\n"),
    );

    const hover = buildHover(document, Position.create(3, 10));
    expect(hover).not.toBeNull();
    const contents = typeof hover?.contents === "object" && "value" in hover.contents ? hover.contents.value : "";
    expect(contents).toContain("BuilderParam");
    expect(contents).toContain("headerBuilder");
  });

  it("shows @Builder info for standalone @Builder functions", () => {
    const document = makeDocument(
      "file:///utils.ets",
      [
        "@Builder",
        "function CommonHeader(title: string) {",
        "  Text(title);",
        "}",
      ].join("\n"),
    );

    const hover = buildHover(document, Position.create(0, 2));
    expect(hover).not.toBeNull();
    const contents = typeof hover?.contents === "object" && "value" in hover.contents ? hover.contents.value : "";
    expect(contents).toContain("@Builder");
    expect(contents).toContain("CommonHeader");
  });
});

describe("@Builder completion support", () => {
  it("includes @Builder methods in this. completion", () => {
    const document = makeDocument(
      "file:///home.ets",
      [
        "@Component",
        "struct HomePage {",
        "  @Builder",
        "  myHeader() {",
        "    Text('header');",
        "  }",
        "  build() {",
        "    this.",
        "  }",
        "}",
      ].join("\n"),
    );

    const members = buildClassMemberCompletionItems(document, "HomePage", "", "instance");
    const builderItem = members.find((item) => item.label === "myHeader");
    expect(builderItem).toBeDefined();
    expect(builderItem?.detail).toContain("@Builder");
  });

  it("includes @BuilderParam fields in this. completion", () => {
    const document = makeDocument(
      "file:///card.ets",
      [
        "struct CustomCard {",
        "  @BuilderParam headerBuilder: () => void;",
        "  @State count: number = 0;",
        "  build() {",
        "    this.",
        "  }",
        "}",
      ].join("\n"),
    );

    const members = buildClassMemberCompletionItems(document, "CustomCard", "", "instance");
    const paramItem = members.find((item) => item.label === "headerBuilder");
    expect(paramItem).toBeDefined();
    expect(paramItem?.detail).toContain("BuilderParam");
  });
});

describe("@Provide / @Consume decoration awareness", () => {
  it("recognizes @Provide decorated fields", () => {
    const document = makeDocument(
      "file:///parent.ets",
      [
        "struct Parent {",
        "  @Provide sharedCount: number = 0;",
        "  build() {}",
        "}",
      ].join("\n"),
    );

    const hover = buildHover(document, Position.create(1, 13));
    expect(hover).not.toBeNull();
    const contents = typeof hover?.contents === "object" && "value" in hover.contents ? hover.contents.value : "";
    expect(contents).toContain("Provide");
  });

  it("recognizes @Consume decorated fields", () => {
    const document = makeDocument(
      "file:///child.ets",
      [
        "struct Child {",
        "  @Consume sharedCount: number;",
        "  build() {}",
        "}",
      ].join("\n"),
    );

    const hover = buildHover(document, Position.create(1, 12));
    expect(hover).not.toBeNull();
    const contents = typeof hover?.contents === "object" && "value" in hover.contents ? hover.contents.value : "";
    expect(contents).toContain("Consume");
  });

  it("recognizes @Observed and @ObjectLink decorated fields", () => {
    const document = makeDocument(
      "file:///link.ets",
      [
        "@Observed",
        "class DataModel {",
        "  value: number = 0;",
        "}",
        "struct Viewer {",
        "  @ObjectLink data: DataModel;",
        "  build() {}",
        "}",
      ].join("\n"),
    );

    const hover = buildHover(document, Position.create(5, 15));
    expect(hover).not.toBeNull();
    const contents = typeof hover?.contents === "object" && "value" in hover.contents ? hover.contents.value : "";
    expect(contents).toContain("ObjectLink");
  });
});

describe("build() method awareness in completion", () => {
  it("provides UI component completion hints inside build() method", () => {
    const document = makeDocument(
      "file:///home.ets",
      [
        "@Component",
        "struct HomePage {",
        "  build() {",
        "    ",
        "  }",
        "}",
      ].join("\n"),
    );

    // Inside build(), common ArkTS UI components should be suggested
    const items = buildCompletionItems([document], document, Position.create(3, 4));
    // Should include keywords and potentially UI component names
    expect(items.length).toBeGreaterThan(0);
  });
});

describe("@Builder navigation", () => {
  it("navigates to @Builder method definition on hover via import link", () => {
    const builderDoc = makeDocument(
      "file:///builders.ets",
      [
        "@Builder",
        "export function HeaderBuilder(title: string) {",
        "  Text(title);",
        "}",
      ].join("\n"),
    );
    const importerDoc = makeDocument(
      "file:///home.ets",
      "import { HeaderBuilder } from './builders';\nHeaderBuilder('hello');",
    );

    const hover = buildLinkedHover([builderDoc, importerDoc], importerDoc, Position.create(1, 3), (documentUri, specifier) => {
      if (specifier === "./builders") return builderDoc;
      return null;
    });

    expect(hover).not.toBeNull();
    const contents = typeof hover?.contents === "object" && "value" in hover.contents ? hover.contents.value : "";
    expect(contents).toContain("@Builder");
    expect(contents).toContain("HeaderBuilder");
  });
});
