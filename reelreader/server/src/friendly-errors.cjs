"use strict";

// Turns raw yt-dlp / ffmpeg / model errors into short messages for the page.
// The raw text is only ever written to the server log, never sent to clients.

const { HttpError } = require("./errors.cjs");

function siteName(url) {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch (e) { /* ignore */ }
  if (/(^|\.)instagram\.com$/.test(host)) return "Instagram";
  if (/(^|\.)tiktok\.com$/.test(host)) return "TikTok";
  if (/(^|\.)youtube\.com$/.test(host) || host === "youtu.be") return "YouTube";
  return "The video site";
}

const RULES = [
  { re: /sign in to confirm|not a bot|429|too many requests|rate.?limit|http error 403|forbidden|not granting access|empty media response|unexpected response from webpage|impersonat|blocked/i,
    status: 502, code: "source_blocked",
    msg: (s) => s + " blocked the server. Try again later or use another link." },
  { re: /private video|this video is private|login required|log in|members.only|age.?restricted|confirm your age/i,
    status: 422, code: "source_private",
    msg: (s) => "This " + s + " video needs a login (private, members-only or age-restricted). Try a public link." },
  { re: /video unavailable|has been removed|does not exist|not found|404|no video formats|unsupported url|is not a valid url/i,
    status: 404, code: "source_unavailable",
    msg: (s) => "Couldn't find a video at that " + s + " link. Check it opens in a browser, or use another link." },
  { re: /timed out|timeout|SIGKILL/i,
    status: 504, code: "timeout",
    msg: () => "Downloading the video took too long. Try again or use a shorter clip." },
  { re: /ffmpeg/i,
    status: 502, code: "convert_failed",
    msg: () => "Couldn't convert the video. Try another link." },
  { re: /gemini|generativelanguage|api key|quota|resource.?exhausted|model/i,
    status: 502, code: "model_failed",
    msg: () => "The AI step failed. Try again in a minute." },
];

// A block or rate limit from the video site (or a downloader API). These are the only errors
// link-fetch.cjs moves on to the next fetcher for; validation errors (HttpError: too long, too
// large) and "private" / "not found" never retry.
const BLOCK_RE = RULES.find((r) => r.code === "source_blocked").re;
function isRetryableFetchError(error) {
  if (!error || error instanceof HttpError) return false;
  return BLOCK_RE.test(String(error.message || error));
}

function toFriendlyError(error, url, log = console) {
  const raw = String((error && error.message) || error || "unknown error");
  log.error("[reel-reader] processing error for " + siteName(url) + ": " + raw);
  const site = siteName(url);
  for (const r of RULES) {
    if (r.re.test(raw)) return new HttpError(r.status, r.code, r.msg(site));
  }
  return new HttpError(502, "processing_failed", "Couldn't process that video. Try again later or use another link.");
}

module.exports = { toFriendlyError, siteName, isRetryableFetchError };
