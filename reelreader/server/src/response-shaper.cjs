"use strict";

function cleanString(value) {
  if (value == null) return "";
  return String(value).trim();
}

function cleanSteps(value) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanString).filter(Boolean);
}

function cleanRecipe(raw) {
  if (!raw || typeof raw !== "object") return null;
  const ingredientsInput = Array.isArray(raw.ingredients) ? raw.ingredients : [];
  const methodInput = Array.isArray(raw.method) ? raw.method : [];

  const ingredients = ingredientsInput
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = cleanString(item.item || item.name);
      const quantity = cleanString(item.quantity);
      if (!name && !quantity) return null;
      return { item: name || "unspecified", quantity: quantity || "unspecified" };
    })
    .filter(Boolean);

  const method = methodInput.map(cleanString).filter(Boolean);
  if (!ingredients.length && !method.length) return null;
  return { ingredients, method };
}

function formatRecipe(recipe) {
  if (!recipe) return "Not a recipe video.";
  const ingredientsLines = recipe.ingredients.length
    ? recipe.ingredients.map((item) => "- " + item.quantity + " " + item.item)
    : ["- (none listed)"];
  const methodLines = recipe.method.length
    ? recipe.method.map((step, index) => (index + 1) + ". " + step)
    : ["1. (none listed)"];
  return ["Ingredients:", ...ingredientsLines, "", "Method:", ...methodLines].join("\n");
}

function buildPrompt(payload) {
  const transcript = cleanString(payload.transcript);
  const caption = cleanString(payload.caption);
  const steps = cleanSteps(payload.steps);
  const recipe = cleanRecipe(payload.recipe);
  const givenPrompt = cleanString(payload.prompt);

  const prompt = givenPrompt || [
    "Analyze this short-form video and use the extracted details below.",
    "",
    "Speech transcript:",
    transcript || "(not detected)",
    "",
    "On-screen text / caption:",
    caption || "(not detected)",
    "",
    "Step-by-step sequence:",
    steps.length ? steps.map((step, i) => (i + 1) + ". " + step).join("\n") : "(not detected)",
    "",
    "Recipe details:",
    formatRecipe(recipe)
  ].join("\n");

  return { prompt, transcript, caption, steps, recipe };
}

module.exports = { cleanString, cleanSteps, cleanRecipe, buildPrompt };
