/* TipBot model stats — public API host (not a secret). */
window.ND_MODELS_CONFIG = Object.freeze({
  API_BASE: "https://afl-tipster-bot.onrender.com",
  TOKEN_KEY: "nd_models_owner_token",
  MODELS: ["with_price", "without_price", "agree"],
  MODEL_LABELS: Object.freeze({
    with_price: "With price",
    without_price: "Without price",
    agree: "Agree",
  }),
  STAKED_ONLY_FROM: "2026-11-12",
  STAKED_SECTION_LABEL: "Since 12 Nov 2026 (stake brackets start)",
});