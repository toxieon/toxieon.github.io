"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { HttpError } = require("./errors.cjs");
const { isRetryableGeminiError, withGeminiRetry } = require("./gemini-retry.cjs");

test("isRetryableGeminiError detects 429/503 and high-demand text", () => {
  assert.equal(isRetryableGeminiError({ status: 429 }), true);
  assert.equal(isRetryableGeminiError({ status: 503 }), true);
  assert.equal(isRetryableGeminiError(new Error("Model is experiencing high demand")), true);
  assert.equal(isRetryableGeminiError(new Error("bad api key")), false);
});

test("withGeminiRetry succeeds after retryable failures", async () => {
  let calls = 0;
  const result = await withGeminiRetry(async () => {
    calls++;
    if (calls < 3) {
      const err = new Error("high demand");
      err.status = 503;
      throw err;
    }
    return "ok";
  }, { deadlineMs: Date.now() + 60000 });
  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("withGeminiRetry returns model_busy after max attempts", async () => {
  await assert.rejects(
    withGeminiRetry(async () => {
      const err = new Error("overloaded");
      err.status = 503;
      throw err;
    }, { deadlineMs: Date.now() + 120000 }),
    (error) => error instanceof HttpError && error.code === "model_busy"
  );
});

test("withGeminiRetry does not retry non-retryable errors", async () => {
  let calls = 0;
  await assert.rejects(
    withGeminiRetry(async () => {
      calls++;
      throw new Error("invalid request");
    }),
    /invalid request/
  );
  assert.equal(calls, 1);
});

test("withGeminiRetry respects deadline before sleeping", async () => {
  await assert.rejects(
    withGeminiRetry(async () => {
      const err = new Error("high demand");
      err.status = 429;
      throw err;
    }, { deadlineMs: Date.now() + 5 }),
    (error) => error instanceof HttpError && error.code === "model_busy"
  );
});
