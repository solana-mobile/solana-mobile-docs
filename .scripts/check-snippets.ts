import { dirname } from "node:path";
import { createTwoslasher } from "twoslash";
import ts from "typescript";

const excludedDirectories = [".git/", ".scripts/", "node_modules/"];
const languages = new Set(["javascript", "js", "jsx", "ts", "tsx", "typescript"]);
const repoRoot = `${import.meta.dir}/..`;

type Problem = {
  code?: number;
  file: string;
  line: number;
  message: string;
};

type Block = {
  code: string;
  language: string;
  line: number;
};

// Matches twoslash's own pattern; it splits the block into virtual files, which can leave code unchecked.
const filenamePattern = /^[\t\v\f ]*\/\/\s?@filename: (.+)$/gm;
const openFencePattern = /^(\s*)(`{3,}|~{3,})[ \t]*(\S*)(.*)$/;

const twoslasher = createTwoslasher({
  // skipLibCheck, on by default, only skips .d.ts files, so the samples themselves are still fully checked.
  compilerOptions: { checkJs: true, jsx: ts.JsxEmit.ReactJSX, strict: true },
  // keepNotations keeps error positions in the original block, including hidden setup code above a cut.
  handbookOptions: { keepNotations: true, noErrorValidation: true },
  // twoslash resolves packages from here and needs a path without `..` segments.
  vfsRoot: dirname(import.meta.dir),
});

// Finds fenced blocks whose opening line has a supported language followed by `twoslash`.
const findBlocks = (source: string) => {
  const blocks: Block[] = [];
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const match = openFencePattern.exec(lines[index] ?? "");

    if (!match) {
      continue;
    }

    const [, indent = "", fence = "", language = "", meta = ""] = match;
    // A closing fence uses the same character, is at least as long as the opening one, and is indented at most 3 spaces more.
    const closeIndex = lines.findIndex((line, lineIndex) => {
      const trimmed = line.trimStart();

      return (
        lineIndex > index &&
        line.length - trimmed.length <= indent.length + 3 &&
        /^(`+|~+)\s*$/.test(trimmed) &&
        trimmed.startsWith(fence)
      );
    });
    // An unclosed fence runs to the end of the document.
    const end = closeIndex === -1 ? lines.length : closeIndex;

    if (
      languages.has(language.toLowerCase()) &&
      meta.split(/\s+/).includes("twoslash")
    ) {
      blocks.push({
        code: lines
          .slice(index + 1, end)
          .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
          .join("\n"),
        language: language.toLowerCase(),
        line: index + 1,
      });
    }

    index = end;
  }

  return blocks;
};

export const checkSource = (file: string, source: string) => {
  const problems: Problem[] = [];

  for (const block of findBlocks(source)) {
    const lineOf = (start: number) =>
      block.line + block.code.slice(0, start).split("\n").length;
    const filenames = [...block.code.matchAll(filenamePattern)];

    if (filenames.length > 0) {
      for (const { index } of filenames) {
        problems.push({
          file,
          line: lineOf(index),
          message: "the @filename flag is not allowed, only @errors",
        });
      }

      continue;
    }

    try {
      const { errors, meta } = twoslasher(block.code, block.language);
      const expected = meta.handbookOptions.errors;

      // Other flags, like `@noErrors` or `@strict: false`, would let a block skip the check.
      for (const flag of meta.flagNotations) {
        if (flag.name !== "errors") {
          problems.push({
            file,
            line: lineOf(flag.start),
            message: `the @${flag.name} flag is not allowed, only @errors`,
          });
        }
      }

      for (const error of errors) {
        if (!expected.includes(error.code)) {
          problems.push({
            code: error.code,
            file,
            line: lineOf(error.start),
            message: error.text,
          });
        }
      }

      for (const expectedCode of expected) {
        if (!errors.some((error) => error.code === expectedCode)) {
          problems.push({
            code: expectedCode,
            file,
            line: block.line,
            message: `expected error ${expectedCode} was not raised`,
          });
        }
      }
    } catch (error) {
      problems.push({
        file,
        line: block.line,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return problems;
};

if (import.meta.main) {
  const files = [
    ...new Bun.Glob("**/*.mdx").scanSync({
      cwd: repoRoot,
      dot: true,
      onlyFiles: true,
    }),
  ]
    .filter(
      (file) =>
        !excludedDirectories.some((directory) => file.startsWith(directory)),
    )
    .sort((a, b) => a.localeCompare(b));

  const problems: Problem[] = [];
  let checkedBlocks = 0;

  for (const file of files) {
    const source = await Bun.file(`${repoRoot}/${file}`).text();

    checkedBlocks += findBlocks(source).length;
    problems.push(...checkSource(file, source));
  }

  if (problems.length > 0) {
    console.error(`Snippet check failed with ${problems.length} problem(s):`);

    for (const problem of problems) {
      console.error(
        `- ${problem.file}:${problem.line}: ${problem.code ? `TS${problem.code}: ` : ""}${problem.message}`,
      );
    }

    process.exitCode = 1;
  } else {
    console.log(`Snippet check passed for ${checkedBlocks} blocks.`);
  }
}
