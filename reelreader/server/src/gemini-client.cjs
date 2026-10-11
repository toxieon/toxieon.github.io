"use strict";

const path = require("node:path");
const { GoogleGenAI } = require("@google/genai");
const { HttpError } = require("./errors.cjs");

const ANALYSIS_INSTRUCTION = [
  "You are Reel Reader.",
  "Return strict JSON only (no markdown fences) with keys:",
  "{",
  '  "prompt": string,',
  '  "transcript": string,',
  '  "caption": string,',
  '  "steps": string[],',
  '  "recipe": null | { "ingredients": [{"item": string, "quantity": string}], "method": string[] }',
  "}",
  "Use recipe=null unless the clip is a recipe or cooking tutorial."
].join("\n");

async function analyzeVideoFile(filePath, apiKey, model) {
  if (!apiKey) throw new HttpError(500, "missing_config", "GEMINI_API_KEY is not configured.");
  const ai = new GoogleGenAI({ apiKey });
  let upload = null;
  try {
    upload = await ai.files.upload({
      file: filePath,
      config: { mimeType: "video/mp4", displayName: path.basename(filePath) }
    });

    upload = await waitForActive(ai, upload);

    const response = await ai.models.generateContent({
      model: model || "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { text: ANALYSIS_INSTRUCTION },
          { fileData: { mimeType: upload.mimeType || "video/mp4", fileUri: upload.uri } }
        ]
      }],
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response && response.text ? String(response.text).trim() : "";
    if (!text) throw new HttpError(502, "model_failed", "Gemini returned an empty response.");
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new HttpError(502, "model_failed", "Gemini returned invalid JSON.");
    }
  } finally {
    if (upload && upload.name) {
      await ai.files.delete({ name: upload.name }).catch(() => {});
    }
  }
}

// Uploaded videos must finish processing (state ACTIVE) before they can be used.
async function waitForActive(ai, file, timeoutMs = 120000, intervalMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  let current = file;
  while (current && current.state && String(current.state).toUpperCase() === "PROCESSING") {
    if (Date.now() > deadline) throw new HttpError(504, "timeout", "The AI step took too long to read the video. Try a shorter clip.");
    await new Promise((r) => setTimeout(r, intervalMs));
    current = await ai.files.get({ name: current.name });
  }
  if (current && current.state && String(current.state).toUpperCase() === "FAILED") {
    throw new HttpError(502, "model_failed", "The AI step couldn't read this video. Try another clip.");
  }
  return current;
}

module.exports = { analyzeVideoFile, waitForActive };
