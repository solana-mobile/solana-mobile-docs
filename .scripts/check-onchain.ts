import { $ } from "bun";

// git grep is always available in CI and only searches tracked files.
const grep = await $`git grep -n -I -i -w -E ${"on[- ]chain"} -- . :!.scripts`.nothrow().quiet();

// git grep exits 1 when nothing matches; anything higher means the scan failed.
if (grep.exitCode > 1) {
  console.error(grep.stderr.toString());
  process.exit(grep.exitCode);
}

if (grep.exitCode === 0) {
  console.error(grep.stdout.toString());
  console.error('Write "onchain" instead of "on-chain" or "on chain".');
  process.exitCode = 1;
}
