"use strict";

const { HttpError } = require("./errors.cjs");
const { toFriendlyError } = require("./friendly-errors.cjs");
const { inspectVideo, downloadVideo, ensureMp4, probeUploadedVideo, cleanupTemp } = require("./media-tools.cjs");
const { buildPrompt } = require("./response-shaper.cjs");

const DEFAULT_LIMITS = {
  maxDurationSec: 300,
  maxBytes: 120 * 1024 * 1024,
  commandTimeoutMs: 120000
};

async function runReelReader(url, opts = {}) {
  const limits = Object.assign({}, DEFAULT_LIMITS, opts.limits || {});
  const deps = {
    inspectVideo: (opts.deps && opts.deps.inspectVideo) || inspectVideo,
    downloadVideo: (opts.deps && opts.deps.downloadVideo) || downloadVideo,
    ensureMp4: (opts.deps && opts.deps.ensureMp4) || ensureMp4,
    analyzeVideoFile: (opts.deps && opts.deps.analyzeVideoFile) || loadGeminiAnalyzer(),
    cleanupTemp: (opts.deps && opts.deps.cleanupTemp) || cleanupTemp
  };

  let tempDir = "";
  try {
    await deps.inspectVideo(url, limits, limits.commandTimeoutMs, opts.igCookies);
    const downloaded = await deps.downloadVideo(url, limits, limits.commandTimeoutMs, opts.igCookies);
    tempDir = downloaded.tempDir;
    const normalizedPath = await deps.ensureMp4(downloaded.filePath, limits.commandTimeoutMs);
    const raw = await deps.analyzeVideoFile(normalizedPath, opts.geminiApiKey, opts.model);
    return buildPrompt(raw || {});
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw toFriendlyError(error, url, opts.log || console);
  } finally {
    await deps.cleanupTemp(tempDir);
  }
}

async function runReelReaderUpload(uploaded, opts = {}) {
  const limits = Object.assign({}, DEFAULT_LIMITS, opts.limits || {});
  const deps = {
    probeUploadedVideo: (opts.deps && opts.deps.probeUploadedVideo) || probeUploadedVideo,
    ensureMp4: (opts.deps && opts.deps.ensureMp4) || ensureMp4,
    analyzeVideoFile: (opts.deps && opts.deps.analyzeVideoFile) || loadGeminiAnalyzer(),
    cleanupTemp: (opts.deps && opts.deps.cleanupTemp) || cleanupTemp
  };

  const tempDir = uploaded.tempDir;
  try {
    await deps.probeUploadedVideo(uploaded.filePath, limits, limits.commandTimeoutMs);
    const normalizedPath = await deps.ensureMp4(uploaded.filePath, limits.commandTimeoutMs);
    const raw = await deps.analyzeVideoFile(normalizedPath, opts.geminiApiKey, opts.model);
    return buildPrompt(raw || {});
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "processing_failed", "Couldn't process that video. Try again or use a shorter clip.");
  } finally {
    await deps.cleanupTemp(tempDir);
  }
}

function loadGeminiAnalyzer() {
  return require("./gemini-client.cjs").analyzeVideoFile;
}

module.exports = { DEFAULT_LIMITS, runReelReader, runReelReaderUpload };
