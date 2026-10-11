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

module.exports = { analyzeVideoFile };
