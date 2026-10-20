"use strict";

const { createServer } = require("./server.cjs");
const { DEFAULT_GEMINI_MODEL } = require("./gemini-config.cjs");

const { createLinkFetcher, configFromEnv, describeConfig, serviceDeps } = require("./link-fetch.cjs");

const port = Number(process.env.PORT || 8080);
// Link mode's fetcher (REEL_READER_FETCHER, default "ytdlp" = unchanged behaviour). A bad fetcher
// config stops the service at boot with a message that never contains the proxy URL or API key.
const fetcherConfig = configFromEnv(process.env);
const linkFetcher = createLinkFetcher(fetcherConfig);
const server = createServer({
  deps: serviceDeps(linkFetcher),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  reelReaderKey: process.env.REEL_READER_KEY || "",
  igCookies: process.env.IG_COOKIES || "",
  geminiModel: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
  endpointTimeoutMs: Number(process.env.REEL_READER_TIMEOUT_MS || 180000),
  limits: {
    maxDurationSec: Number(process.env.REEL_READER_MAX_DURATION_SEC || 300),
    maxBytes: Number(process.env.REEL_READER_MAX_BYTES || 125829120),
    commandTimeoutMs: Number(process.env.REEL_READER_COMMAND_TIMEOUT_MS || 120000)
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log("Reel Reader service listening on port " + port + " (" + describeConfig(fetcherConfig) + ")");
});
