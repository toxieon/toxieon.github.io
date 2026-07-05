/* Node test harness for nd-ui.js pure helpers (DOM parts are exercised
 * in-browser; the logic that can regress silently is tested here).
 * Run:  node shared/nd-ui.test.js
 */
const U = require("./nd-ui.js");

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else      { fail++; console.log("  FAIL  " + name); }
}

console.log("highResUrl — the v1.0 §1.2 lightbox regex fix");
ok(U.highResUrl("https://lh3.googleusercontent.com/abc=s220") === "https://lh3.googleusercontent.com/abc=s1600",
   "=s220 -> =s1600");
ok(U.highResUrl("https://lh3.googleusercontent.com/abc=s220-c") === "https://lh3.googleusercontent.com/abc=s1600",
   "cropped thumb token (=s220-c) also upgraded");
ok(U.highResUrl("https://x.com/abc=s220", 800) === "https://x.com/abc=s800", "custom size");
ok(U.highResUrl("https://x.com/plain.jpg") === "https://x.com/plain.jpg", "no size token -> untouched");
ok(U.highResUrl("") === "" && U.highResUrl(null) === null, "empty/null passthrough");
// the actual historical bug: a URL ending in literal backslash-d wouldn't exist,
// but the broken regex /=s\\d+$/ would have LEFT a real thumb URL untouched:
ok("https://x.com/abc=s220".replace(/=s\\d+$/, "=s1600") === "https://x.com/abc=s220",
   "(sanity) the old double-backslash regex really was a no-op");

console.log("escapeHtml");
ok(U.escapeHtml('<img src=x onerror="pwn()">&\'') === "&lt;img src=x onerror=&quot;pwn()&quot;&gt;&amp;&#39;", "escapes all five");
ok(U.escapeHtml(null) === "" && U.escapeHtml(undefined) === "", "null/undefined -> empty");
ok(U.escapeHtml(42) === "42", "numbers stringified");

console.log("skeletonMarkup");
{
  const m = U.skeletonMarkup({ rows: 4, variant: "card" });
  ok((m.match(/nd-skel-item/g) || []).length === 4, "row count");
  ok(m.indexOf("nd-skel--card") !== -1, "variant class");
  ok(m.indexOf('aria-hidden="true"') !== -1, "hidden from screen readers");
}
ok(U.skeletonMarkup({ variant: "bogus" }).indexOf("nd-skel--list-row") !== -1, "unknown variant falls back to list-row");
ok((U.skeletonMarkup({}).match(/nd-skel-item/g) || []).length === 3, "default 3 rows");
ok(U.SKELETON_VARIANTS.join(",") === "list-row,card,grid-tile,table-row", "all four §1.5 variants");

console.log("syncChipLabel (§1.6 states)");
ok(U.syncChipLabel("synced", 0) === "synced", "green label");
ok(U.syncChipLabel("pending", 3) === "3 queued", "amber label with count");
ok(U.syncChipLabel("flushing", 1) === "1 queued", "flushing reads as queued");
ok(U.syncChipLabel("failed", 2) === "2 failed", "red label with count");
ok(U.syncChipLabel("failed", 0) === "sync failed", "red label without count");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
