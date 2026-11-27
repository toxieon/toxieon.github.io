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
  /* First 7am best-pick lock (4 Nov 2026, confirmed by Husker); best picks are requested from here (or 365 days back, whichever is later). */
  BEST_PICKS_FROM: "2026-11-04",
  /* First HorsePicks AI Hybrid agreeing pick (3 Nov 2026, confirmed by Husker). Omit from for all history. */
  HYBRID_PICKS_FROM: "2026-11-03",
  STAKED_SECTION_LABEL: "Since 12 Nov 2026 (stake brackets start)",
});