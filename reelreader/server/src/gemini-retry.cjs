"use strict";

const { HttpError } = require("./errors.cjs");

const MODEL_BUSY = new HttpError(
  503,
  "model_busy",
  "The AI is busy right now, try again in a minute."
);

const RETRY_DELAYS_MS = [2000, 5000, 10000];
const MAX_ATTEMPTS = 3;

function isRetryableGeminiError(error) {
  if (!error) return false;
  const status = Number(error.status || error.statusCode || (error.response && error.response.status));
  if (status === 429 || status === 503) return true;
  const msg = String(error.message || error).toLowerCase();
  return /high demand|resource exhausted|overloaded|try again later|unavailable/.test(msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Up to 3 Gemini calls with 2s / 5s / 10s backoff between retryable failures.
 * Stays within deadlineMs when provided.
 */
async function withGeminiRetry(fn, opts = {}) {
  const deadlineMs = opts.deadlineMs;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error instanceof HttpError) throw error;
      if (!isRetryableGeminiError(error)) throw error;
      if (attempt >= MAX_ATTEMPTS - 1) throw MODEL_BUSY;

      const delay = RETRY_DELAYS_MS[attempt] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      if (deadlineMs && Date.now() + delay > deadlineMs) throw MODEL_BUSY;
      await sleep(delay);
    }
  }

  if (lastError && isRetryableGeminiError(lastError)) throw MODEL_BUSY;
  throw lastError;
}

module.exports = {
  MODEL_BUSY,
  RETRY_DELAYS_MS,
  MAX_ATTEMPTS,
  isRetryableGeminiError,
  withGeminiRetry,
  sleep
};
