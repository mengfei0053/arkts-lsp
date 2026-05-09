import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { parseArkTS, ArkTSNode, findNodesByType, getDecoratorNames, getStructDeclarations, getBuilderFunctions, getBuilderParamFields, getClassBodyMembers, getTopLevelDeclarations, getBuildMethodComponentCalls, getBuildMethodComponentTree } from "../src/parser.js";

function makeDocument(uri: string, text: string): TextDocument {
  return TextDocument.create(uri, "arkts", 1, text);
}

describe("parseArkTS", () => {
  it("parses a simple struct and returns a tree", () => {
    const document = makeDocument("file:///entry.ets", "struct HomePage {}");
    const tree = parseArkTS(document);
    expect(tree).not.toBeNull();
    expect(tree?.rootNodeType).toBe("program");
  });

  it("parses decorated ArkTS components", () => {
    const document = makeDocument(
      "file:///entry.ets",
      [
        "@Entry",
        "@Component",
        "struct HomePage {",
        "  @State count: number = 0;",
        "  build() {}",
        "}",
      ].join("\n"),
    );
    const tree = parseArkTS(document);
    expect(tree).not.toBeNull();
  });

  it("returns null for empty documents", () => {
    const document = makeDocument("file:///empty.ets", "");
    const tree = parseArkTS(document);
    expect(tree).toBeNull();
  });
});

describe("findNodesByType", () => {
  it("finds all struct_declaration nodes", () => {
    const document = makeDocument(
      "file:///multi.ets",
      ["struct PageA {}", "struct PageB {}", "struct PageC {}"].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const structs = findNodesByType(tree, "struct_declaration");
    expect(structs).toHaveLength(3);
  });

  it("finds all decorator nodes", () => {
    const document = makeDocument(
      "file:///decorated.ets",
      [
        "@Component",
        "struct Home {",
        "  @State count: number;",
        "  @Prop title: string;",
        "}",
      ].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const decorators = findNodesByType(tree, "decorator");
    expect(decorators.length).toBeGreaterThanOrEqual(3);
  });

  it("finds method_definition nodes", () => {
    const document = makeDocument(
      "file:///methods.ets",
      ["struct Home { build() {} helper() {} }"].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const methods = findNodesByType(tree, "method_definition");
    expect(methods).toHaveLength(2);
  });

  it("finds import_statement nodes", () => {
    const document = makeDocument(
      "file:///imports.ets",
      ["import { helper } from './helper';", "import { utils } from './utils';"].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const imports = findNodesByType(tree, "import_statement");
    expect(imports).toHaveLength(2);
  });
});

describe("getDecoratorNames", () => {
  it("extracts decorator names from a node", () => {
    const document = makeDocument(
      "file:///entry.ets",
      [
        "@Entry",
        "@Component",
        "struct HomePage {}",
      ].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const struct = findNodesByType(tree, "struct_declaration")[0];
    const decorators = getDecoratorNames(struct);
    expect(decorators).toContain("Entry");
    expect(decorators).toContain("Component");
  });

  it("returns empty array for nodes without decorators", () => {
    const document = makeDocument("file:///plain.ets", "function helper() {}");
    const tree = parseArkTS(document)!;
    const func = findNodesByType(tree, "function_declaration")[0];
    expect(getDecoratorNames(func)).toEqual([]);
  });

  it("extracts decorator from field definitions", () => {
    const document = makeDocument(
      "file:///fields.ets",
      "struct Home { @State count: number = 0; }",
    );
    const tree = parseArkTS(document)!;
    const fields = findNodesByType(tree, "public_field_definition");
    expect(fields).toHaveLength(1);
    expect(getDecoratorNames(fields[0])).toContain("State");
  });
});

describe("getStructDeclarations", () => {
  it("extracts struct names and their decorators", () => {
    const document = makeDocument(
      "file:///entry.ets",
      [
        "@Entry",
        "@Component",
        "export struct HomePage { build() {} }",
        "struct SplashPage {}",
      ].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const structs = getStructDeclarations(tree);
    expect(structs).toHaveLength(2);
    expect(structs[0].name).toBe("HomePage");
    expect(structs[0].decorators).toContain("Entry");
    expect(structs[0].decorators).toContain("Component");
    expect(structs[0].exported).toBe(true);
    expect(structs[1].name).toBe("SplashPage");
    expect(structs[1].exported).toBe(false);
  });

  it("includes line numbers for each struct", () => {
    const document = makeDocument(
      "file:///entry.ets",
      ["struct First {}", "", "struct Second {}"].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const structs = getStructDeclarations(tree);
    expect(structs[0].line).toBe(0);
    expect(structs[1].line).toBe(2);
  });
});

describe("getBuilderFunctions", () => {
  it("identifies @Builder decorated methods", () => {
    const document = makeDocument(
      "file:///builder.ets",
      [
        "@Component",
        "struct Home {",
        "  @Builder",
        "  myBuilder() {",
        "    Text('hello');",
        "  }",
        "  build() {}",
        "}",
      ].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const builders = getBuilderFunctions(tree);
    expect(builders).toHaveLength(1);
    expect(builders[0].name).toBe("myBuilder");
    expect(builders[0].structName).toBe("Home");
    expect(builders[0].line).toBe(3);
  });

  it("finds multiple @Builder functions in one struct", () => {
    const document = makeDocument(
      "file:///multi-builder.ets",
      [
        "struct Home {",
        "  @Builder header() {}",
        "  @Builder footer() {}",
        "  build() {}",
        "}",
      ].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const builders = getBuilderFunctions(tree);
    expect(builders).toHaveLength(2);
    expect(builders.map((b) => b.name)).toEqual(["header", "footer"]);
  });

  it("returns empty array when no @Builder exists", () => {
    const document = makeDocument(
      "file:///no-builder.ets",
      "struct Home { build() {} }",
    );
    const tree = parseArkTS(document)!;
    expect(getBuilderFunctions(tree)).toEqual([]);
  });
});

describe("getBuilderParamFields", () => {
  it("identifies @BuilderParam decorated fields", () => {
    const document = makeDocument(
      "file:///param.ets",
      [
        "struct CustomCard {",
        "  @BuilderParam headerBuilder: () => void;",
        "  @BuilderParam contentBuilder: () => void;",
        "  build() {}",
        "}",
      ].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const params = getBuilderParamFields(tree);
    expect(params).toHaveLength(2);
    expect(params[0].name).toBe("headerBuilder");
    expect(params[0].structName).toBe("CustomCard");
    expect(params[1].name).toBe("contentBuilder");
  });

  it("returns empty array when no @BuilderParam exists", () => {
    const document = makeDocument(
      "file:///no-param.ets",
      "struct Home { @State count: number; build() {} }",
    );
    const tree = parseArkTS(document)!;
    expect(getBuilderParamFields(tree)).toEqual([]);
  });
});

describe("getClassBodyMembers", () => {
  it("extracts all members from a struct body", () => {
    const document = makeDocument(
      "file:///members.ets",
      [
        "struct Home {",
        "  @State count: number;",
        "  @Prop title: string;",
        "  name: string = 'test';",
        "  build() {}",
        "  helper() {}",
        "}",
      ].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const struct = getStructDeclarations(tree)[0];
    const members = getClassBodyMembers(tree, struct);
    expect(members.fields).toHaveLength(3);
    expect(members.methods).toHaveLength(2);
  });

  it("includes decorator info on fields", () => {
    const document = makeDocument(
      "file:///decorated-fields.ets",
      "struct Home { @State count: number; @Link items: string[]; }",
    );
    const tree = parseArkTS(document)!;
    const struct = getStructDeclarations(tree)[0];
    const members = getClassBodyMembers(tree, struct);
    expect(members.fields).toHaveLength(2);
    const stateField = members.fields.find((f) => f.name === "count");
    expect(stateField?.decorator).toBe("State");
    const linkField = members.fields.find((f) => f.name === "items");
    expect(linkField?.decorator).toBe("Link");
  });

  it("identifies method decorators including @Builder", () => {
    const document = makeDocument(
      "file:///method-deco.ets",
      "struct Home { @Builder renderItem() {} build() {} }",
    );
    const tree = parseArkTS(document)!;
    const struct = getStructDeclarations(tree)[0];
    const members = getClassBodyMembers(tree, struct);
    const builderMethod = members.methods.find((m) => m.name === "renderItem");
    expect(builderMethod?.decorator).toBe("Builder");
    const buildMethod = members.methods.find((m) => m.name === "build");
    expect(buildMethod?.decorator).toBeUndefined();
  });
});

describe("getTopLevelDeclarations", () => {
  it("extracts function declarations with export status", () => {
    const document = makeDocument(
      "file:///funcs.ets",
      [
        "export function loadData(): string { return 'ok'; }",
        "function internalHelper() {}",
      ].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const funcs = getTopLevelDeclarations(tree).functions;
    expect(funcs).toHaveLength(2);
    expect(funcs[0].name).toBe("loadData");
    expect(funcs[0].exported).toBe(true);
    expect(funcs[1].name).toBe("internalHelper");
    expect(funcs[1].exported).toBe(false);
  });

  it("extracts struct declarations", () => {
    const document = makeDocument(
      "file:///structs.ets",
      [
        "export struct PageA {}",
        "struct PageB {}",
      ].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const structs = getTopLevelDeclarations(tree).structs;
    expect(structs).toHaveLength(2);
    expect(structs[0].name).toBe("PageA");
    expect(structs[0].exported).toBe(true);
  });

  it("extracts variable declarations", () => {
    const document = makeDocument(
      "file:///vars.ets",
      ["export const API_URL = 'http://api';", "let counter = 0;"].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const vars = getTopLevelDeclarations(tree).variables;
    expect(vars).toHaveLength(2);
    expect(vars[0].name).toBe("API_URL");
    expect(vars[0].exported).toBe(true);
  });

  it("extracts interface declarations", () => {
    const document = makeDocument(
      "file:///interfaces.ets",
      ["export interface User { name: string; age: number; }"].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const interfaces = getTopLevelDeclarations(tree).interfaces;
    expect(interfaces).toHaveLength(1);
    expect(interfaces[0].name).toBe("User");
  });

  it("extracts import statements with details", () => {
    const document = makeDocument(
      "file:///imports.ets",
      ["import { helper, utils } from './helpers';", "import { config } from '@kit.CoreFileKit';"].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const imports = getTopLevelDeclarations(tree).imports;
    expect(imports).toHaveLength(2);
    expect(imports[0].specifier).toBe("./helpers");
    expect(imports[0].names).toEqual(["helper", "utils"]);
    expect(imports[1].specifier).toBe("@kit.CoreFileKit");
    expect(imports[1].names).toEqual(["config"]);
  });
});

describe("parser edge cases", () => {
  it("handles decorators on separate lines from fields", () => {
    const document = makeDocument(
      "file:///separate.ets",
      [
        "struct Home {",
        "  @Prop",
        "  title: string = 'ArkTS';",
        "}",
      ].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const fields = findNodesByType(tree, "public_field_definition");
    expect(fields).toHaveLength(1);
    expect(getDecoratorNames(fields[0])).toContain("Prop");
  });

  it("handles @BuilderParam with default value", () => {
    const document = makeDocument(
      "file:///default-builder.ets",
      [
        "struct Card {",
        "  @BuilderParam header: () => void = () => Text('default');",
        "  build() {}",
        "}",
      ].join("\n"),
    );
    const tree = parseArkTS(document)!;
    const params = getBuilderParamFields(tree);
    expect(params).toHaveLength(1);
    expect(params[0].name).toBe("header");
  });

  it("handles nested structs and complex bodies", () => {
    const document = makeDocument(
      "file:///complex.ets",
      [
        "@Component",
        "struct ComplexPage {",
        "  @State items: string[] = [];",
        "  @Builder",
        "  renderItem(item: string) {",
        "    Text(item);",
        "  }",
        "  build() {",
        "    Column() {",
        "      ForEach(this.items, (item) => {",
        "        this.renderItem(item);",
        "      });",
        "    }",
        "  }",
        "}",
      ].join("\n"),
    );
    const tree = parseArkTS(document)!;
    expect(tree).not.toBeNull();
    const builders = getBuilderFunctions(tree);
    expect(builders).toHaveLength(1);
    expect(builders[0].name).toBe("renderItem");
    const structs = getStructDeclarations(tree);
    expect(structs).toHaveLength(1);
    expect(structs[0].decorators).toContain("Component");
  });

  it("extracts UI component calls from build() methods", () => {
    const document = makeDocument(
      "file:///complex.ets",
      [
        "@Component",
        "struct ComplexPage {",
        "  build() {",
        "    Column() {",
        "      Text('hello');",
        "      ForEach(this.items, (item) => {",
        "        this.renderItem(item);",
        "      });",
        "    }",
        "  }",
        "}",
      ].join("\n"),
    );

    const tree = parseArkTS(document)!;
    const calls = getBuildMethodComponentCalls(tree, "ComplexPage");

    expect(calls).toEqual(["Column", "Text", "ForEach"]);
  });

  it("extracts a nested UI component tree from build() methods", () => {
    const document = makeDocument(
      "file:///complex.ets",
      [
        "@Component",
        "struct ComplexPage {",
        "  build() {",
        "    Column() {",
        "      Text('hello');",
        "      Row() {",
        "        Button('ok');",
        "      }",
        "    }",
        "  }",
        "}",
      ].join("\n"),
    );

    const tree = parseArkTS(document)!;
    const componentTree = getBuildMethodComponentTree(tree, "ComplexPage");

    expect(componentTree).toEqual([
      {
        name: "Column",
        path: ["Column"],
        arguments: [],
        modifiers: [],
        props: [],
        builderBindings: [],
        range: {
          start: { line: 3, character: 4 },
          end: { line: 8, character: 5 },
        },
        children: [
          {
            name: "Text",
            path: ["Column", "Text"],
            arguments: ["'hello'"],
            modifiers: [],
            props: [],
            builderBindings: [],
            range: {
              start: { line: 4, character: 6 },
              end: { line: 4, character: 19 },
            },
            children: [],
          },
          {
            name: "Row",
            path: ["Column", "Row"],
            arguments: [],
            modifiers: [],
            props: [],
            builderBindings: [],
            range: {
              start: { line: 5, character: 6 },
              end: { line: 7, character: 7 },
            },
            children: [
              {
                name: "Button",
                path: ["Column", "Row", "Button"],
                arguments: ["'ok'"],
                modifiers: [],
                props: [],
                builderBindings: [],
                range: {
                  start: { line: 6, character: 8 },
                  end: { line: 6, character: 20 },
                },
                children: [],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("includes source ranges on build() component tree nodes", () => {
    const document = makeDocument(
      "file:///complex.ets",
      [
        "@Component",
        "struct ComplexPage {",
        "  build() {",
        "    Column() {",
        "      Text('hello');",
        "    }",
        "  }",
        "}",
      ].join("\n"),
    );

    const tree = parseArkTS(document)!;
    const componentTree = getBuildMethodComponentTree(tree, "ComplexPage");

    expect(componentTree[0]).toMatchObject({
      name: "Column",
      range: {
        start: { line: 3, character: 4 },
        end: { line: 5, character: 5 },
      },
    });
    expect(componentTree[0]?.children[0]).toMatchObject({
      name: "Text",
      range: {
        start: { line: 4, character: 6 },
      },
    });
  });

  it("captures build() component arguments, modifiers, and paths", () => {
    const document = makeDocument(
      "file:///complex.ets",
      [
        "@Component",
        "struct ComplexPage {",
        "  build() {",
        "    Column() {",
        "      Text(this.title)",
        "        .fontSize(18)",
        "        .fontWeight(FontWeight.Bold);",
        "      Row() {",
        "        Button('Save').width(120);",
        "      }",
        "    }",
        "  }",
        "}",
      ].join("\n"),
    );

    const tree = parseArkTS(document)!;
    const componentTree = getBuildMethodComponentTree(tree, "ComplexPage");

    expect(componentTree[0]).toMatchObject({
      name: "Column",
      path: ["Column"],
      arguments: [],
      modifiers: [],
    });
    expect(componentTree[0]?.children[0]).toMatchObject({
      name: "Text",
      path: ["Column", "Text"],
      arguments: ["this.title"],
      modifiers: ["fontSize(18)", "fontWeight(FontWeight.Bold)"],
    });
    expect(componentTree[0]?.children[1]).toMatchObject({
      name: "Row",
      path: ["Column", "Row"],
    });
    expect(componentTree[0]?.children[1]?.children[0]).toMatchObject({
      name: "Button",
      path: ["Column", "Row", "Button"],
      arguments: ["'Save'"],
      modifiers: ["width(120)"],
    });
  });

  it("captures structured props and builder bindings from component modifiers", () => {
    const document = makeDocument(
      "file:///builder-tree.ets",
      [
        "@Component",
        "struct HomePage {",
        "  @Builder",
        "  myHeader() {",
        "    Text('header');",
        "  }",
        "  title: string = 'ArkTS';",
        "  build() {",
        "    CustomCard()",
        "      .title(this.title)",
        "      .headerBuilder(this.myHeader);",
        "  }",
        "}",
      ].join("\n"),
    );

    const tree = parseArkTS(document)!;
    const componentTree = getBuildMethodComponentTree(tree, "HomePage");

    expect(componentTree[0]).toMatchObject({
      name: "CustomCard",
      path: ["CustomCard"],
      props: [
        { name: "title", arguments: ["this.title"] },
        { name: "headerBuilder", arguments: ["this.myHeader"] },
      ],
      builderBindings: [
        {
          propName: "headerBuilder",
          source: "this.myHeader",
          sourceKind: "Builder",
          targetName: "myHeader",
        },
      ],
    });
  });
});
