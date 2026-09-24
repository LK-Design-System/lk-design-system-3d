import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

// Both workflows pin the same LDS source commit: CI for conformance and the
// package build, the Pages deploy for the Storybook it publishes. A reusable
// action ref (`uses: …@sha`) must be a literal, so the pin cannot live in one
// shared file — this check keeps the copies equal instead, so a pin bump that
// reaches only one workflow fails lint rather than shipping a Storybook built
// against a different LDS than the one CI verified.
const root = process.cwd();
const workflows = [".github/workflows/ci.yml", ".github/workflows/deploy-storybook-pages.yml"];
const SHA = /[0-9a-f]{40}/;

const pins = new Map();
for (const workflow of workflows) {
  const source = await readFile(path.join(root, workflow), "utf8");
  const found = new Set();
  for (const line of source.split(/\r?\n/)) {
    const ldsAction = line.match(/LK-Design-System\/lk-design-system\/[^@\s]+@([0-9a-f]{40})/);
    if (ldsAction) found.add(ldsAction[1]);
  }
  // `ref:` lines inside the checkout of LK-Design-System/lk-design-system.
  const blocks = source.split(/\n\s*- name:/);
  for (const block of blocks) {
    if (!block.includes("repository: LK-Design-System/lk-design-system")) continue;
    const ref = block.match(/ref:\s*([0-9a-f]{40})/);
    if (ref) found.add(ref[1]);
  }
  pins.set(workflow, found);
}

const all = new Set([...pins.values()].flatMap((set) => [...set]));
const problems = [];
for (const [workflow, found] of pins) {
  if (found.size === 0) problems.push(`${workflow} pins no LDS commit.`);
}
if (all.size > 1) {
  problems.push(
    `LDS pins differ across workflows: ${[...pins].map(([w, f]) => `${w} → ${[...f].join(", ")}`).join("; ")}`,
  );
}
for (const sha of all) if (!SHA.test(sha)) problems.push(`Not a full commit SHA: ${sha}`);

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(`LDS source pinned to one commit in both workflows: ${[...all][0]}.`);
