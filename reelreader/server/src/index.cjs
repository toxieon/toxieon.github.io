"use strict";

const { createServer } = require("./server.cjs");

const port = Number(process.env.PORT || 8080);
const server = createServer({
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  reelReaderKey: process.env.REEL_READER_KEY || "",
  igCookies: process.env.IG_COOKIES || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  endpointTimeoutMs: Number(process.env.REEL_READER_TIMEOUT_MS || 180000),
  limits: {
    maxDurationSec: Number(process.env.REEL_READER_MAX_DURATION_SEC || 300),
    maxBytes: Number(process.env.REEL_READER_MAX_BYTES || 125829120),
    commandTimeoutMs: Number(process.env.REEL_READER_COMMAND_TIMEOUT_MS || 120000)
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log("Reel Reader service listening on port " + port);
});
