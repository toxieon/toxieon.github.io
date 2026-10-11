"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { mkdtempSync } = require("node:fs");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { HttpError } = require("./errors.cjs");

function runCommand(command, args, opts = {}) {
  const timeoutMs = opts.timeoutMs || 90000;
  const child = spawn(command, args, {
    cwd: opts.cwd,
    env: opts.env || process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  const timeout = setTimeout(() => {
    child.kill("SIGKILL");
  }, timeoutMs);

  return new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0) {
        const output = (stderr || stdout || "").trim();
        return reject(new Error((output || command + " failed") + (signal ? " (" + signal + ")" : "")));
      }
      resolve({ stdout, stderr });
    });
  });
}

async function inspectVideo(url, limits, timeoutMs, cookieContent) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "reel-reader-inspect-"));
  try {
    const args = ["--dump-single-json", "--no-playlist"];
    if (cookieContent) {
      const cookiesPath = path.join(tempDir, "cookies.txt");
      await fs.writeFile(cookiesPath, cookieContent, "utf8");
      args.push("--cookies", cookiesPath);
    }
    args.push(url);
    const { stdout } = await runCommand("yt-dlp", args, { timeoutMs });
    let info;
    try {
      info = JSON.parse(stdout);
    } catch (error) {
      throw new HttpError(502, "download_failed", "Failed to parse yt-dlp metadata.");
    }

    const duration = Number(info.duration || 0);
    const expectedSize = Number(info.filesize || info.filesize_approx || 0);
    if (duration && duration > limits.maxDurationSec) {
      throw new HttpError(413, "video_too_long", "Video is too long. Limit is " + limits.maxDurationSec + " seconds.");
    }
    if (expectedSize && expectedSize > limits.maxBytes) {
      throw new HttpError(413, "video_too_large", "Video is too large. Limit is " + formatSize(limits.maxBytes) + ".");
    }
    return info;
  } finally {
    await cleanupTemp(tempDir);
  }
}

async function downloadVideo(url, limits, timeoutMs, cookieContent) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "reel-reader-"));
  const outputTemplate = path.join(tempDir, "input.%(ext)s");
  const args = [
    "--no-playlist",
    "--max-filesize", String(Math.floor(limits.maxBytes / (1024 * 1024))) + "M",
    "--print", "after_move:filepath",
    "-o", outputTemplate
  ];
  if (cookieContent) {
    const cookiesPath = path.join(tempDir, "cookies.txt");
    await fs.writeFile(cookiesPath, cookieContent, "utf8");
    args.push("--cookies", cookiesPath);
  }
  args.push(url);
  const { stdout } = await runCommand("yt-dlp", args, { timeoutMs });
  const filePath = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
  if (!filePath) throw new HttpError(502, "download_failed", "yt-dlp did not return a downloaded file path.");

  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat) throw new HttpError(502, "download_failed", "Downloaded media file was not found.");
  if (stat.size > limits.maxBytes) {
    throw new HttpError(413, "video_too_large", "Downloaded video exceeded the size limit of " + formatSize(limits.maxBytes) + ".");
  }
  return { tempDir, filePath };
}

async function ensureMp4(inputPath, timeoutMs) {
  if (inputPath.toLowerCase().endsWith(".mp4")) return inputPath;
  const outPath = inputPath.replace(/\.[a-z0-9]+$/i, "") + ".mp4";
  const args = [
    "-y",
    "-i", inputPath,
    "-c:v", "mpeg4",
    "-c:a", "aac",
    "-movflags", "+faststart",
    outPath
  ];
  await runCommand("ffmpeg", args, { timeoutMs });
  return outPath;
}

async function cleanupTemp(dirPath) {
  if (!dirPath) return;
  await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {});
}

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(mb >= 10 ? 0 : 1) + " MB";
}

module.exports = {
  runCommand,
  inspectVideo,
  downloadVideo,
  ensureMp4,
  cleanupTemp,
  formatSize
};
