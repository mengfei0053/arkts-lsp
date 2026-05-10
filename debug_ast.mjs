import Parser from "tree-sitter";
import ArkTS from "tree-sitter-arkts";
import fs from "fs";

const parser = new Parser();
parser.setLanguage(ArkTS);

const source = fs.readFileSync("/tmp/test-arkts-project/Index.ets", "utf8");
const tree = parser.parse(source);

function walk(node, depth = 0) {
  if (node.type.includes("method")) {
    console.log(" ".repeat(depth) + `type=${node.type} start=${node.startPosition.row}:${node.startPosition.column} end=${node.endPosition.row}:${node.endPosition.column}`);
    for (const child of node.children) {
      console.log(" ".repeat(depth+2) + `child type=${child.type} text="${child.text.slice(0,50)}"`);
    }
  }
  for (const child of node.children) {
    walk(child, depth + 1);
  }
}

walk(tree.rootNode);

const lines = source.split("\n");
console.log("\nLine 14:", JSON.stringify(lines[14]));
console.log("Line 20:", JSON.stringify(lines[20]));
console.log("Line 21:", JSON.stringify(lines[21]));
console.log("Line 22:", JSON.stringify(lines[22]));
