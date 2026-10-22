import { $ } from "bun";

type LinkPage = {
  line: number;
  page: string;
};

const linkPrefix = "https://github.com/solana-mobile";
const linkPattern = `${linkPrefix}[^]<>)"'\`[:space:]]*`;
const links = new Map<string, LinkPage[]>();
let missingLinks = 0;

// git grep is always available in CI and only searches tracked files.
const grep = await $`git grep -n -o -I -E ${linkPattern} -- . :!.scripts`.nothrow().quiet();

// git grep exits 1 when nothing matches; anything higher means the scan failed.
if (grep.exitCode > 1) {
  console.error(grep.stderr.toString());
  process.exit(grep.exitCode);
}

const grepOutput = grep.stdout.toString();

for (const line of grepOutput.trim().split("\n").filter(Boolean)) {
  const [page, lineText, ...rest] = line.split(":");
  const lineNumber = Number(lineText);
  const link = rest.join(":").replace(/[.,;:]+$/, "");
  const pages = links.get(link) ?? [];

  if (!pages.some((entry) => entry.page === page && entry.line === lineNumber)) {
    pages.push({ line: lineNumber, page });
  }

  links.set(link, pages);
}

for (const [link, pages] of [...links.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  // --retry covers timeouts, 429 and 5xx; only a remaining 4xx is a confirmed missing link.
  const status = (
    await $`curl -L -s -o /dev/null -w "%{http_code}" --max-time 20 --retry 3 ${link}`.nothrow().text()
  ).trim();
  const exists = status.startsWith("2") || status.startsWith("3");
  const missing = status.startsWith("4") && status !== "429";

  console.log(`${exists ? "OK" : missing ? "MISSING" : "UNKNOWN"} ${status} ${link}`);

  if (missing) {
    missingLinks += 1;
  }

  for (const entry of pages.sort((a, b) => a.page.localeCompare(b.page) || a.line - b.line)) {
    console.log(`  - ${entry.page}:${entry.line}`);
  }

  console.log();
}

if (links.size === 0) {
  console.log(`No links found for ${linkPrefix}`);
}

if (missingLinks > 0) {
  console.error(`${missingLinks} of ${links.size} ${linkPrefix} link(s) are missing.`);
  process.exitCode = 1;
}
