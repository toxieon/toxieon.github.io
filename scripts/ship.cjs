#!/usr/bin/env node
/* One-command ship for a Neill Data PR. A dry run unless --execute is passed.
 *
 *   node scripts/ship.cjs --branch <name> --slug <slug> [--execute]
 *                         [--base origin/main] [--site https://www.neilldata.com] [--timeout-min 10]
 *
 * Always runs (read-only checks; any failure refuses to ship):
 *   1. working tree clean and on --branch
 *   2. every app changed vs <base> has a version bump (VERSION file, or the SW cache vN for apps
 *      without one). Tests (*.test.*), docs (*.md) and the CI-generated hub/apps.json don't count.
 *   3. npm test, npm run icons:check, node scripts/lint-release.cjs --base <base>
 * Then, printed in a dry run and run with --execute:
 *   4. tag checkpoint-pre-<slug>-<YYYY-MM-DD> on <base> and push it
 *   5. push the branch; open a PR with gh (or reuse the open one)
 *   6. wait for CI (gh pr checks --watch)
 *   7. squash-merge
 *   8. poll the live site until each changed app serves its new VERSION (10 minute timeout)
 *   9. run scripts/live-check.cjs for the changed apps with --expect-repo-versions
 * Ends with the rollback commands. Uses the gh CLI already signed in on this machine; this script
 * never reads, stores or prints a token. No dependencies (Node built-ins only).
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { liveVersions } = require("./live-check.cjs");

const IGNORED_CHANGE = [/\.test\.[cm]?js$/i, /\.md$/i, /^hub\/apps\.json$/];
const NOISY_TEST_OUTPUT = ["1234567890/visual-catalog.json"]; // npm test rewrites its generatedAt

function parseArgs(argv) {
  const out = { execute: false, base: "origin/main", site: "https://www.neilldata.com", timeoutMin: 10 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined) throw new Error(a + " needs a value"); return v; };
    if (a === "--branch") out.branch = val();
    else if (a === "--slug") out.slug = val();
    else if (a === "--execute") out.execute = true;
    else if (a === "--base") out.base = val();
    else if (a === "--site") out.site = val().replace(/\/+$/, "");
    else if (a === "--timeout-min") out.timeoutMin = Number(val());
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error("unknown option " + a);
  }
  if (out.help) return out;
  if (!out.branch) throw new Error("--branch is required");
  if (!out.slug || !/^[a-z0-9][a-z0-9-]*$/.test(out.slug)) throw new Error("--slug is required (lowercase letters, numbers and dashes)");
  if (!/^[\w./-]+$/.test(out.branch) || out.branch.startsWith("-")) throw new Error("--branch has unexpected characters");
  if (!/^[\w./-]+$/.test(out.base) || out.base.startsWith("-")) throw new Error("--base has unexpected characters");
  if (!(out.timeoutMin > 0)) throw new Error("--timeout-min must be a positive number");
  return out;
}

// ── process helpers ─────────────────────────────────────────────────────────
let ROOT = process.cwd();
const say = (s) => process.stdout.write(s + "\n");
const show = (cmd, args) => [cmd, ...args].map((a) => (/^([\w./:=@,+-]+|<\w+>)$/.test(a) ? a : JSON.stringify(a))).join(" ");

/** Runs a command and returns {code, stdout}. `live` streams its output (tests, CI watch). */
function sh(cmd, args, { live = false, allowFail = false } = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: live ? "inherit" : ["ignore", "pipe", "pipe"], shell: false });
  const code = r.error ? 127 : r.status;
  if (code !== 0 && !allowFail) {
    const err = new Error(show(cmd, args) + " failed" + (r.error ? " (" + r.error.code + ")" : " (exit " + code + ")"));
    err.output = (r.stderr || "") + (r.stdout || "");
    throw err;
  }
  return { code, stdout: (r.stdout || "").trim() };
}
const git = (...args) => sh("git", args).stdout;

class Refusal extends Error {}
const refuse = (msg) => { throw new Refusal(msg); };

// ── checks ──────────────────────────────────────────────────────────────────
function checkTree(opts) {
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== opts.branch) refuse(`on branch "${branch}", not "${opts.branch}". Check out the branch first.`);
  const dirty = git("status", "--porcelain");
  if (dirty) refuse("working tree is not clean. Commit or stash first:\n" + dirty.split("\n").map((l) => "    " + l).join("\n"));
  say("  ok  on " + branch + ", working tree clean");
}

function showAt(ref, file) {
  const r = sh("git", ["show", ref + ":" + file], { allowFail: true });
  return r.code === 0 ? r.stdout : null;
}
const cacheVersion = (sw) => { const m = /CACHE_VERSION\s*=\s*['"][a-z0-9]+-(v\d+|\d+\.\d+\.\d+)['"]/i.exec(sw || ""); return m ? m[1] : null; };

/** The top-level app folders this branch changes, each with its old and new version. */
function changedApps(opts) {
  if (sh("git", ["rev-parse", "--verify", "--quiet", opts.base], { allowFail: true }).code !== 0) {
    refuse(`base "${opts.base}" not found. Run: git fetch origin`);
  }
  const files = git("diff", "--name-only", opts.base + "...HEAD").split("\n").filter(Boolean);
  const byApp = new Map();
  for (const f of files) {
    if (!f.includes("/") || IGNORED_CHANGE.some((re) => re.test(f))) continue;
    const dir = f.split("/")[0];
    if (dir.startsWith(".") || !fs.existsSync(path.join(ROOT, dir, "index.html"))) continue;
    if (!byApp.has(dir)) byApp.set(dir, []);
    byApp.get(dir).push(f);
  }
  const apps = [];
  for (const [dir, list] of byApp) {
    const versionFile = path.join(ROOT, dir, "VERSION");
    if (fs.existsSync(versionFile)) {
      const now = fs.readFileSync(versionFile, "utf8").trim();
      const before = (showAt(opts.base, dir + "/VERSION") || "").trim();
      apps.push({ dir, kind: "VERSION", before: before || null, now, bumped: !before || before !== now, files: list });
    } else if (fs.existsSync(path.join(ROOT, dir, "sw.js"))) {
      const now = cacheVersion(fs.readFileSync(path.join(ROOT, dir, "sw.js"), "utf8"));
      const before = cacheVersion(showAt(opts.base, dir + "/sw.js"));
      apps.push({ dir, kind: "SW cache", before, now, bumped: !before || before !== now, files: list });
    } else {
      apps.push({ dir, kind: "none", before: null, now: null, bumped: true, files: list });
    }
  }
  return apps;
}

function checkBumps(apps) {
  if (!apps.length) { say("  ok  no app folder changed (nothing to bump or poll)"); return; }
  const missing = apps.filter((a) => !a.bumped);
  for (const a of apps.filter((x) => x.bumped)) {
    say("  ok  " + a.dir + ": " + (a.kind === "none" ? "no VERSION or sw.js (nothing to bump)" : a.kind + " " + (a.before || "new") + " -> " + a.now));
  }
  if (missing.length) {
    refuse("version not bumped (release rule: every changed app bumps its version):\n" + missing.map((a) =>
      "    " + a.dir + ": " + a.kind + " is still " + a.now + " (changed: " + a.files.slice(0, 3).join(", ") + (a.files.length > 3 ? ", ..." : "") + ")").join("\n"));
  }
}

function runTests(opts) {
  const cmds = [["npm", ["test"]], ["npm", ["run", "icons:check"]], ["node", ["scripts/lint-release.cjs", "--base", opts.base]]];
  for (const [cmd, args] of cmds) {
    say("  $ " + show(cmd, args));
    const r = sh(cmd, args, { live: true, allowFail: true });
    if (r.code !== 0) refuse(show(cmd, args) + " failed (exit " + r.code + ")");
  }
  // npm test refreshes a generated date; put it back so the tree stays as it was.
  const dirty = git("status", "--porcelain").split("\n").filter(Boolean);
  const noisy = dirty.filter((l) => NOISY_TEST_OUTPUT.includes(l.slice(3)));
  if (noisy.length) sh("git", ["checkout", "--", ...noisy.map((l) => l.slice(3))]);
  if (dirty.length > noisy.length) refuse("the tests left the working tree dirty:\n" + dirty.filter((l) => !noisy.includes(l)).map((l) => "    " + l).join("\n"));
  say("  ok  tests, icons and release lint pass");
}

// ── plan ────────────────────────────────────────────────────────────────────
function today() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function buildPlan(opts, apps) {
  const [remote, ...rest] = opts.base.split("/");
  const mainBranch = rest.join("/") || "main";
  const tag = "checkpoint-pre-" + opts.slug + "-" + today();
  const pollApps = apps.filter((a) => a.kind === "VERSION");
  const sameRepo = path.resolve(__dirname, "..") === path.resolve(ROOT);
  const liveCheckArgs = [sameRepo ? "scripts/live-check.cjs" : path.join(__dirname, "live-check.cjs"), "--base", opts.site];
  if (!sameRepo) liveCheckArgs.push("--root", ROOT);
  if (apps.length) liveCheckArgs.push("--only", apps.map((a) => a.dir).join(","), "--expect-repo-versions");
  return { remote, mainBranch, tag, pollApps, liveCheckArgs, steps: [
    { n: 4, title: "Checkpoint tag on " + opts.base, cmds: [["git", ["fetch", remote, mainBranch]], ["git", ["tag", tag, opts.base]], ["git", ["push", remote, "refs/tags/" + tag]]] },
    { n: 5, title: "Push the branch and open (or reuse) the PR", cmds: [["git", ["push", "-u", remote, opts.branch]], ["gh", ["pr", "list", "--head", opts.branch, "--state", "open", "--json", "number,url"]], ["gh", ["pr", "create", "--base", mainBranch, "--head", opts.branch, "--fill"]]] },
    { n: 6, title: "Wait for CI", cmds: [["gh", ["pr", "checks", "<pr>", "--watch", "--fail-fast"]]] },
    { n: 7, title: "Squash-merge", cmds: [["gh", ["pr", "merge", "<pr>", "--squash"]]] },
    { n: 8, title: "Wait for GitHub Pages", note: pollApps.length
      ? "poll " + opts.site + " every 20 s (up to " + opts.timeoutMin + " min) until " + pollApps.map((a) => a.dir + " serves " + a.now).join(", ")
      : "no app VERSION changed, so nothing to poll" },
    { n: 9, title: "Live check", cmds: [["node", liveCheckArgs]] },
  ] };
}

function printPlan(plan) {
  for (const s of plan.steps) {
    say("\n" + s.n + ". " + s.title);
    if (s.note) say("     " + s.note);
    for (const [c, a] of s.cmds || []) say("     $ " + show(c, a));
  }
  say("     (step 5 runs gh pr create only when gh pr list finds no open PR)");
}

function printRollback(plan, opts, mergeSha) {
  say("\nRollback, if the release needs undoing:");
  say("  # revert the squash commit through a normal PR (preferred)");
  say("  git fetch " + plan.remote + " && git switch -c revert-" + opts.slug + " " + opts.base);
  say("  git revert --no-edit " + (mergeSha || "<squash-merge sha: gh pr view <pr> --json mergeCommit --jq .mergeCommit.oid>"));
  say("  git push -u " + plan.remote + " revert-" + opts.slug + " && gh pr create --base " + plan.mainBranch + " --fill");
  say("  # compare against the checkpoint taken before the merge");
  say("  git diff " + plan.tag + " " + opts.base);
  say("  # drop the checkpoint tag if this release is abandoned before merging");
  say("  git push " + plan.remote + " :refs/tags/" + plan.tag + " && git tag -d " + plan.tag);
}

// ── execute ─────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function execute(plan, opts) {
  const run = (cmd, args, o) => { say("  $ " + show(cmd, args)); return sh(cmd, args, o); };
  // 4. checkpoint tag
  run("git", ["fetch", plan.remote, plan.mainBranch]);
  const target = git("rev-parse", opts.base);
  const existing = sh("git", ["rev-parse", "--verify", "--quiet", "refs/tags/" + plan.tag], { allowFail: true });
  if (existing.code === 0) {
    if (git("rev-list", "-n", "1", plan.tag) !== target) refuse("tag " + plan.tag + " already exists on another commit. Delete it or use another --slug.");
    say("  ok  tag " + plan.tag + " already on " + opts.base);
  } else run("git", ["tag", plan.tag, opts.base]);
  run("git", ["push", plan.remote, "refs/tags/" + plan.tag]);
  // 5. branch + PR
  run("git", ["push", "-u", plan.remote, opts.branch]);
  let pr = null;
  const open = JSON.parse(run("gh", ["pr", "list", "--head", opts.branch, "--state", "open", "--json", "number,url"]).stdout || "[]");
  if (open.length) { pr = open[0]; say("  ok  reusing PR #" + pr.number + " " + pr.url); }
  else {
    run("gh", ["pr", "create", "--base", plan.mainBranch, "--head", opts.branch, "--fill"]);
    pr = JSON.parse(run("gh", ["pr", "view", opts.branch, "--json", "number,url"]).stdout);
    say("  ok  opened PR #" + pr.number + " " + pr.url);
  }
  // 6. CI
  const ci = run("gh", ["pr", "checks", String(pr.number), "--watch", "--fail-fast"], { live: true, allowFail: true });
  if (ci.code !== 0) refuse("CI failed or was cancelled on PR #" + pr.number + ". Nothing was merged.");
  // 7. merge
  run("gh", ["pr", "merge", String(pr.number), "--squash"]);
  let mergeSha = "";
  try { mergeSha = (JSON.parse(run("gh", ["pr", "view", String(pr.number), "--json", "mergeCommit"]).stdout).mergeCommit || {}).oid || ""; } catch (e) { /* shown as a placeholder */ }
  // 8. poll
  if (plan.pollApps.length) {
    const deadline = Date.now() + opts.timeoutMin * 60000;
    const pollMs = Number(process.env.SHIP_POLL_MS || 20000);
    const waiting = new Set(plan.pollApps.map((a) => a.dir));
    say("  polling " + opts.site + " for " + [...waiting].join(", "));
    while (waiting.size) {
      for (const a of plan.pollApps.filter((x) => waiting.has(x.dir))) {
        const v = await liveVersions(opts.site, "/" + a.dir + "/");
        if (v.length && v.every((x) => x === a.now)) { waiting.delete(a.dir); say("  ok  " + a.dir + " is live at " + a.now); }
      }
      if (!waiting.size) break;
      if (Date.now() > deadline) refuse("timed out after " + opts.timeoutMin + " min waiting for " + [...waiting].join(", ") + " to go live. The PR is merged; check the Pages deploy.");
      await sleep(pollMs);
    }
  }
  // 9. live check
  const lc = run("node", plan.liveCheckArgs, { live: true, allowFail: true });
  return { mergeSha, liveOk: lc.code === 0, pr };
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error("ship: " + e.message); process.exit(2); }
  if (opts.help) { say(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^#!.*\n\/\* ?/, "")); return; }
  try {
    ROOT = git("rev-parse", "--show-toplevel");
  } catch (e) { console.error("ship: not inside a git repository"); process.exit(2); }

  say((opts.execute ? "SHIP (executing)" : "SHIP (dry run: nothing that writes will run; add --execute to ship)") + ": " + opts.branch + " as " + opts.slug);
  let plan;
  try {
    say("\n1. Working tree");
    checkTree(opts);
    say("\n2. Version bumps vs " + opts.base);
    const apps = changedApps(opts);
    checkBumps(apps);
    say("\n3. Tests");
    runTests(opts);
    plan = buildPlan(opts, apps);
    if (!opts.execute) {
      printPlan(plan);
      printRollback(plan, opts, "");
      say("\nDry run complete. Re-run with --execute to ship.");
      return;
    }
    const res = await execute(plan, opts);
    printRollback(plan, opts, res.mergeSha);
    if (!res.liveOk) { console.error("\nship: merged as PR #" + res.pr.number + ", but the live check failed (see above)."); process.exit(1); }
    say("\nShipped: PR #" + res.pr.number + " merged and live.");
  } catch (e) {
    if (e instanceof Refusal) { console.error("\nship: refusing to ship: " + e.message); if (plan) printRollback(plan, opts, ""); process.exit(1); }
    console.error("\nship: " + e.message + (e.output ? "\n" + String(e.output).trim().split("\n").slice(-15).join("\n") : ""));
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { parseArgs };
