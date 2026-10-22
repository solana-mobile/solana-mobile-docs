const disclaimerImport =
  'import { FooterDisclaimer } from "/snippets/footer-disclaimer.mdx";';
const disclaimerInvocation = "<FooterDisclaimer />";
const excludedDirectories = [".git/", ".scripts/", "node_modules/"];
const excludedPages = new Set(["index.mdx"]);
const repoRoot = `${import.meta.dir}/..`;

type Problem = {
  file: string;
  message: string;
};

const countOccurrences = (source: string, value: string) =>
  source.split(value).length - 1;

const codeFencePattern = /^\s*(```|~~~)/m;
const snippetImportPattern = /from "(\/snippets\/[^"]+\.mdx)"/g;

// A page has code when it has a fenced block or imports a snippet that has one.
const hasCode = async (source: string) => {
  if (codeFencePattern.test(source)) {
    return true;
  }

  for (const [, snippet] of source.matchAll(snippetImportPattern)) {
    if (codeFencePattern.test(await Bun.file(`${repoRoot}${snippet}`).text())) {
      return true;
    }
  }

  return false;
};

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
let checkedPages = 0;

for (const file of files) {
  const source = await Bun.file(`${repoRoot}/${file}`).text();
  const importCount = countOccurrences(source, disclaimerImport);
  const invocationCount = countOccurrences(source, disclaimerInvocation);
  const isExcluded =
    excludedPages.has(file) ||
    file.startsWith("snippets/") ||
    !source.trim() ||
    !(await hasCode(source));

  if (isExcluded) {
    if (importCount > 0 || invocationCount > 0) {
      problems.push({
        file,
        message: "has no code samples, so it must not have the footer disclaimer",
      });
    }

    continue;
  }

  checkedPages += 1;

  if (importCount !== 1) {
    problems.push({
      file,
      message: `expected one disclaimer import, found ${importCount}`,
    });
  }

  if (invocationCount !== 1) {
    problems.push({
      file,
      message: `expected one disclaimer invocation, found ${invocationCount}`,
    });
  }

  if (
    invocationCount === 1 &&
    !source.trimEnd().endsWith(disclaimerInvocation)
  ) {
    problems.push({
      file,
      message: "the disclaimer invocation is not at the end of the page",
    });
  }
}

if (problems.length > 0) {
  console.error(`Footer disclaimer check failed with ${problems.length} problem(s):`);

  for (const problem of problems) {
    console.error(`- ${problem.file}: ${problem.message}`);
  }

  process.exitCode = 1;
} else {
  console.log(`Footer disclaimer check passed for ${checkedPages} pages.`);
}
