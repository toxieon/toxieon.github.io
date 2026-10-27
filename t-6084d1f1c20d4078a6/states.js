/* Test assets page: state tables and pure helpers. Fake data only. Classic script (browser global TA_STATES) and CommonJS (node tests). */
(function (root) {
  "use strict";
  const CAMERAS = [
    { id: "broadcast", label: "Broadcast", pos: [-36, 11, 6], look: [0, 1, -2] },
    { id: "north", label: "North end", pos: [0, 4.5, -44], look: [0, 2, 0] },
    { id: "south", label: "South end", pos: [0, 4.5, 44], look: [0, 2, 0] },
    { id: "wing", label: "Wing", pos: [30, 2.6, 0], look: [0, 1.5, 0] },
    { id: "blimp", label: "Blimp", pos: [0, 64, 9], look: [0, 0, 0] },
  ];
  const TIMES = [{ id: "day", label: "Day" }, { id: "night", label: "Night" }];
  const VIEWS = [
    { id: "follower", label: "Follower", stake: false, odds: true, payout: true, bookie: true, selection: true, owner: false },
    { id: "owner", label: "Owner", stake: true, odds: true, payout: true, bookie: true, selection: true, owner: true },
    { id: "public", label: "Public (sponsor)", stake: false, odds: false, payout: false, bookie: false, selection: false, owner: false },
  ];
  const BALLS = ["afl", "american-football", "baseball", "basketball", "cricket-red", "cricket-white", "golf", "ice-hockey-puck", "netball", "rugby-league", "rugby-union", "soccer", "softball", "table-tennis", "tennis", "volleyball", "water-polo"];
  const CLIPS = ["idle", "run", "kick", "jump", "mark", "tackle", "celebrate", "throw", "shot", "catch", "bowl", "batCricket", "batBaseball", "serve", "dribble", "passChest", "passFoot", "dive", "celebrateArms", "celebrateKnee", "celebrateFist", "pitch", "golfSwing"];
  const LOOP_CLIPS = ["idle", "run", "dribble"];
  const GAME_STATES = [
    { id: "upcoming", label: "UPCOMING", clock: "Sat 7:40 PM", score: false },
    { id: "live", label: "LIVE", clock: null, score: true },
    { id: "final", label: "FINAL", clock: "Full time", score: true },
  ];
  const LEG_LINE = 25;
  const LEG_STATES = [
    { id: "on-track", label: "On track", tone: "#2e9d5b", current: 14, pulse: false },
    { id: "at-risk", label: "At risk", tone: "#d98a1c", current: 7, pulse: false },
    { id: "near-miss", label: "Near miss", tone: "#e0561f", current: 24, pulse: true },
    { id: "hit", label: "Hit", tone: "#1fb36b", current: 28, pulse: false },
    { id: "miss", label: "Miss", tone: "#d6334a", current: 9, pulse: false },
    { id: "push", label: "Push", tone: "#7c8aa0", current: 25, pulse: false },
    { id: "void", label: "Void", tone: "#8a8f98", current: null, pulse: false },
  ];
  const GUERNSEYS = ["adelaide", "brisbane", "carlton", "collingwood", "essendon", "fremantle", "geelong", "goldcoast", "gws", "hawthorn", "melbourne", "northmelbourne", "portadelaide", "richmond", "stkilda", "sydney", "tasmania", "westcoast", "westernbulldogs"];
  const BOOKIES = ["bet365", "betfair", "betr", "betright", "bluebet", "dabble", "ladbrokes", "neds", "picklebet", "playup", "pointsbet", "sportsbet", "tab", "unibet"];
  const COURSES = [
    { id: "flemington", name: "Flemington", circuit: 2312, straight: 450 },
    { id: "caulfield", name: "Caulfield", circuit: 2080, straight: 367 },
    { id: "moonee-valley", name: "Moonee Valley", circuit: 1805, straight: 173 },
    { id: "sandown-hillside", name: "Sandown Hillside", circuit: 2087, straight: 491 },
    { id: "generic-turf-oval", name: "Generic turf oval", circuit: 2000, straight: 400 },
    { id: "generic-synthetic-oval", name: "Generic synthetic oval", circuit: 1800, straight: 330 },
    { id: "generic-straight-1000", name: "Generic straight 1000", circuit: null, straight: 1000 },
  ];
  const EFFECTS = [
    { id: "goal", label: "Goal" },
    { id: "behind", label: "Behind" },
    { id: "flyby", label: "Fly-past" },
    { id: "win", label: "Sponsor win (+2.5U)" },
  ];
  const WIN_STYLES = [{ id: "glow", label: "Glow" }, { id: "border", label: "Border" }];
  const MULTI_LEGS = [
    { sel: "Fake Player A 25+ disposals", odds: 1.9 },
    { sel: "Fake Player B 2+ goals", odds: 2.6 },
    { sel: "Test FC to win", odds: 1.55 },
    { sel: "Total over 160.5", odds: 1.9 },
  ];
  const SINGLE_LEG = { sel: "Fake Player A 25+ disposals", odds: 1.9 };
  const STAKE = 10;
  const WIN_UNITS = 2.5;
  const TEST_BANNER = "TEST PAGE - fake data, nothing is sent anywhere";

  const byId = (list, id) => list.find((x) => x.id === id);
  const scoreTotal = (g, b) => g * 6 + b;
  const clockText = (q, secs) => "Q" + q + " " + Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
  const legProgress = (line, current) => (current == null ? 0 : Math.max(0, Math.min(1, current / line)));
  /* legs: [{state, odds}] -> counts and a status. push and void legs drop out of the payout. */
  function summarizeMulti(legs, stake) {
    const c = { hit: 0, miss: 0, live: 0, dropped: 0 };
    let mult = 1;
    for (const l of legs) {
      if (l.state === "hit") { c.hit++; mult *= l.odds; }
      else if (l.state === "miss") c.miss++;
      else if (l.state === "push" || l.state === "void") c.dropped++;
      else { c.live++; mult *= l.odds; }
    }
    const status = c.miss ? "lost" : c.live ? "live" : c.hit ? "won" : "void";
    return { hit: c.hit, total: legs.length, status, payout: status === "lost" || status === "void" ? 0 : Math.round(stake * mult * 100) / 100, miss: c.miss, dropped: c.dropped };
  }
  /* The goal end the effect uses, given the camera position: end cameras look at the far goal, others use north. */
  function goalEnd(camPos) { return Math.abs(camPos[2]) > 20 ? -Math.sign(camPos[2]) : -1; }

  const API = { CAMERAS, TIMES, VIEWS, BALLS, CLIPS, LOOP_CLIPS, GAME_STATES, LEG_LINE, LEG_STATES, GUERNSEYS, BOOKIES, COURSES, EFFECTS, WIN_STYLES, MULTI_LEGS, SINGLE_LEG, STAKE, WIN_UNITS, TEST_BANNER, byId, scoreTotal, clockText, legProgress, summarizeMulti, goalEnd };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.TA_STATES = API;
})(typeof window !== "undefined" ? window : globalThis);
