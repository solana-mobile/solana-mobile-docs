import { expect, test } from "bun:test";
import { checkSource } from "./check-snippets";

const fence = "```";

test("ignores blocks without the marker or in other languages", () => {
  const source = [
    `${fence}ts`,
    "const a: string = 1;",
    fence,
    `${fence}rust twoslash`,
    "let a: u8 = 1;",
    fence,
  ].join("\n");

  expect(checkSource("page.mdx", source)).toEqual([]);
});

test("reports unexpected errors with the line in the MDX file", () => {
  const source = [
    "# Page",
    "",
    `${fence}tsx twoslash title="Example"`,
    "const a: string = 1;",
    fence,
  ].join("\n");

  expect(checkSource("page.mdx", source)).toEqual([
    {
      code: 2322,
      file: "page.mdx",
      line: 4,
      message: "Type 'number' is not assignable to type 'string'.",
    },
  ]);
});

test("checks hidden setup code and maps lines in indented blocks", () => {
  const source = [
    "<Steps>",
    `  ${fence}typescript twoslash`,
    "  const hidden: number = 'x';",
    "  // ---cut---",
    "  const shown = hidden;",
    `  ${fence}`,
    "</Steps>",
  ].join("\n");

  expect(checkSource("page.mdx", source).map((p) => [p.line, p.code])).toEqual(
    [[3, 2322]],
  );
});

test("allows errors listed with @errors and reports missing packages", () => {
  const source = [
    `${fence}ts twoslash`,
    "// @errors: 2322",
    "const a: string = 1;",
    "import { b } from 'not-a-real-package';",
    fence,
  ].join("\n");

  const problems = checkSource("page.mdx", source);

  expect(problems.map((p) => [p.line, p.code])).toEqual([[4, 2307]]);
  expect(problems[0]?.message).toContain("not-a-real-package");
});

test("maps lines below an @errors line", () => {
  const source = [
    `${fence}ts twoslash`,
    "// @errors: 2339",
    "const a: string = 1;",
    "a.nope;",
    fence,
  ].join("\n");

  expect(checkSource("page.mdx", source).map((p) => [p.line, p.code])).toEqual([[3, 2322]]);
});

test("refuses flags that would skip the check", () => {
  const source = [
    `${fence}ts twoslash`,
    "// @noErrors",
    "// @strict: false",
    "const a: string = 1;",
    fence,
  ].join("\n");

  expect(checkSource("page.mdx", source).map((p) => [p.line, p.message])).toEqual([
    [2, "the @noErrors flag is not allowed, only @errors"],
    [3, "the @strict flag is not allowed, only @errors"],
  ]);
});

test("refuses @filename, which can hide code from the check", () => {
  const source = [
    `${fence}ts twoslash`,
    "// @filename: example.txt",
    "const a: string = 1;",
    fence,
  ].join("\n");

  expect(checkSource("page.mdx", source).map((p) => [p.line, p.message])).toEqual([
    [2, "the @filename flag is not allowed, only @errors"],
  ]);
});

test("ends a block at a longer closing fence", () => {
  const source = [`${fence}ts twoslash`, "const a = 1;", `${fence}\``, "not code"].join("\n");

  expect(checkSource("page.mdx", source)).toEqual([]);
});

test("finds blocks with a space before the language", () => {
  const source = [`${fence} ts twoslash`, "const a: string = 1;", fence].join("\n");

  expect(checkSource("page.mdx", source).map((p) => [p.line, p.code])).toEqual([[2, 2322]]);
});

test("keeps a fence indented 4 or more spaces as code", () => {
  const source = [
    `${fence}ts twoslash`,
    "/*",
    `    ${fence}`,
    "*/",
    "const a: string = 1;",
    fence,
  ].join("\n");

  expect(checkSource("page.mdx", source).map((p) => [p.line, p.code])).toEqual([[5, 2322]]);
});

test("checks an unclosed block to the end of the document", () => {
  const source = [`${fence}ts twoslash`, "const a: string = 1;"].join("\n");

  expect(checkSource("page.mdx", source).map((p) => [p.line, p.code])).toEqual([[2, 2322]]);
});

test("finds blocks in files with CRLF line endings", () => {
  const source = [`${fence}ts twoslash`, "const a: string = 1;", fence].join("\r\n");

  expect(checkSource("page.mdx", source).map((p) => [p.line, p.code])).toEqual([[2, 2322]]);
});

test("reports an expected error that never happens", () => {
  const source = [`${fence}ts twoslash`, "// @errors: 2322", "const a = 1;", fence].join("\n");

  expect(checkSource("page.mdx", source)).toEqual([
    {
      code: 2322,
      file: "page.mdx",
      line: 1,
      message: "expected error 2322 was not raised",
    },
  ]);
});

test("type-checks JavaScript blocks", () => {
  const source = [`${fence}js twoslash`, "const a = 1;", "a.nope();", fence].join("\n");

  expect(checkSource("page.mdx", source).map((p) => [p.line, p.code])).toEqual([[3, 2339]]);
});
