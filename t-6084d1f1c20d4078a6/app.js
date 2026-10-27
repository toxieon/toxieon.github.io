/* Test assets page. Fake data only; no network beyond this folder's own static files. */
import * as THREE from "./vendor/three.module.min.js";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "./vendor/libs/meshopt_decoder.module.js";
import { startBallFlyby, loadBall, applySponsorTexture } from "./vendor/flyby.js";
import { kitMaterials, dressedPlayer } from "./vendor/kits.js";

const S = globalThis.TA_STATES;
const CLUBS = (globalThis.TBAflGuernseys && globalThis.TBAflGuernseys.CLUBS) || [];
const $ = (id) => document.getElementById(id);
const GU = "../assets/tipdash/guernseys/", BK = "../assets/tipdash/bookies/";
const SPONSOR = "QUOKKA";
const reducedMq = matchMedia("(prefers-reduced-motion: reduce)").matches;
const st = { camera: "broadcast", time: "day", view: "owner", sport: "afl", ball: "afl", clip: "idle", mcg: "unknown", game: "live", home: "geelong", away: "collingwood", hg: 8, hb: 5, ag: 6, ab: 9, quarter: 2, secs: 754, legState: "on-track", current: 14, multi: false, bookie: "sportsbet", course: "none", boards: true, ballPatch: true, emblems: true, winStyle: "glow", reduced: reducedMq, width: "phone" };
const log = [];
const note = (e) => log.push({ e, t: Math.round(performance.now()) });
const club = (id) => CLUBS.find((c) => c.id === id) || { primary: "#444", secondary: "#ddd", pattern: "solid" };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let scene2 = null; // active scene implementation (3D or 2D)

/* ---------- HUD ---------- */
function venueTag() {
  if (st.course === "mcg") {
    if (st.mcg === "ok") return scene2 && scene2.mode === "2d" ? `<div class="vtag real">MCG model loaded (drawn in 3D only, not in this 2D view)</div>` : `<div class="vtag real">MCG: Brandon's real model</div>`;
    return `<div class="vtag missing"><b>MCG model not found</b><small>models/mcg.glb is not on this page. The ground shown is a generic stand-in, not the MCG.</small></div>`;
  }
  const v = S.byId(S.VENUES, st.course); if (!v) return "";
  return v.kind === "real" ? `<div class="vtag real">REAL: ${v.name}</div>` : `<div class="vtag stand">STAND-IN: ${v.name}${v.id === "none" ? " (generic oval, not the MCG)" : " (generic, not a real course)"}</div>`;
}
function renderHud() {
  const v = S.byId(S.VIEWS, st.view), g = S.byId(S.GAME_STATES, st.game), ls = S.byId(S.LEG_STATES, st.legState);
  const hs = S.scoreTotal(st.hg, st.hb), as = S.scoreTotal(st.ag, st.ab);
  const mid = g.score ? `<span class="sc">${st.hg}.${st.hb} (${hs})</span><span class="gs ${g.id}">${g.label}</span><span class="sc">${st.ag}.${st.ab} (${as})</span>`
    : `<span class="gs">${g.label}</span>`;
  const clk = g.clock || S.clockText(st.quarter, st.secs);
  const sb = `<div class="sb"><img alt="" src="${GU}${st.home}.svg">${mid}<img alt="" src="${GU}${st.away}.svg"><span class="clk">${clk}</span></div>`;
  const win = st.legState === "hit";
  const cls = ["card", win && st.winStyle === "glow" ? "glow" : "", win && st.winStyle === "border" ? "thick" : "", ls.pulse && !st.reduced ? "pulse" : "", $("hud").dataset.winning ? "glow" : ""].join(" ");
  const bk = v.bookie ? `<img alt="${st.bookie}" src="${BK}${st.bookie}.svg">` : `<span class="tag">${SPONSOR}</span>`;
  let body;
  if (st.multi) {
    const legs = S.MULTI_LEGS.map((l, i) => ({ ...l, state: i === 0 ? st.legState : ["", "hit", "on-track", "hit"][i] }));
    const sum = S.summarizeMulti(legs, S.STAKE);
    const rows = legs.map((l) => `<div><span>${v.selection ? l.sel : "Leg"}</span><b style="--c:${S.byId(S.LEG_STATES, l.state).tone}">${S.byId(S.LEG_STATES, l.state).label}</b></div>`).join("");
    body = `<div class="r1">${bk}<span class="sel">Multi ${sum.hit}/${sum.total} legs hit</span><span class="chip">${sum.status}</span></div>
      <div class="bar"><i style="width:${(sum.hit / sum.total) * 100}%"></i></div><div class="legs">${rows}</div>
      <div class="r3"><span>${v.stake ? "Stake $" + S.STAKE : ""}</span><span>${v.payout ? "Payout $" + sum.payout : "Sponsor view"}</span></div>`;
  } else {
    const leg = S.SINGLE_LEG, p = S.legProgress(S.LEG_LINE, st.current);
    const pay = st.legState === "miss" ? "$0" : st.legState === "push" || st.legState === "void" ? "refund $" + S.STAKE : "$" + (S.STAKE * leg.odds).toFixed(2);
    body = `<div class="r1">${bk}<span class="sel">${v.selection ? leg.sel : "Leg (hidden in public view)"}</span><span class="chip">${ls.label}</span></div>
      <div class="bar"><i style="width:${p * 100}%"></i></div>
      <div class="r3"><span>${ls.current == null ? "voided" : st.current + " / " + S.LEG_LINE}</span><span>${v.odds ? "@" + leg.odds.toFixed(2) : ""}</span><span>${v.stake ? "Stake $" + S.STAKE : ""}</span><span>${v.payout ? pay : ""}</span></div>`;
  }
  $("hud").innerHTML = sb + venueTag() + `<div class="${cls}" id="legcard" style="--tone:${ls.tone}">${body}<div class="tag">${v.owner ? "owner view (edit enabled)" : st.view + " view"}</div></div>`;
}

/* ---------- controls ---------- */
const refreshers = [];
function change(key) {
  renderHud(); refreshers.forEach((f) => f());
  if (key === "reduced") document.body.classList.toggle("reduced", st.reduced);
  if (key === "width") $("wrap").className = "w-" + st.width;
  scene2 && scene2.apply(key);
}
const set = (k, v) => { st[k] = v; if (k === "sport") { const sp = S.byId(S.SPORTS, v); st.ball = sp.balls[0]; st.clip = sp.def; } if (k === "legState") { const c = S.byId(S.LEG_STATES, v).current; if (c != null) st.current = c; } change(k); };
function group(title, open, fn) {
  const d = document.createElement("details"); d.open = open; d.innerHTML = `<summary>${title}</summary>`;
  const b = document.createElement("div"); b.className = "grp"; d.appendChild(b); fn(b); $("controls").appendChild(d);
}
function row(parent, label) { const r = document.createElement("div"); r.className = "row"; r.innerHTML = label ? `<label>${label}</label>` : ""; parent.appendChild(r); return r; }
function seg(parent, label, list, key) {
  const r = row(parent, label), box = document.createElement("div"); box.className = "seg"; r.appendChild(box);
  const btns = list.map((o) => { const b = document.createElement("button"); b.type = "button"; b.textContent = o.label; b.dataset.k = key; b.dataset.v = o.id; b.onclick = () => set(key, o.id); box.appendChild(b); return [o.id, b]; });
  const rf = () => btns.forEach(([id, b]) => b.setAttribute("aria-pressed", String(st[key] === id))); refreshers.push(rf); rf();
}
function select(parent, label, list, key, extra) {
  const r = row(parent, label), s = document.createElement("select"); s.dataset.k = key;
  s.innerHTML = (extra || []).concat(list).map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
  s.onchange = () => set(key, s.value); r.appendChild(s); const rf = () => { s.value = st[key]; }; refreshers.push(rf); rf();
}
/* a select whose options depend on state (rebuilt on every refresh) */
function dyn(parent, label, key, optsFn) {
  const r = row(parent, label), s = document.createElement("select"); s.dataset.k = key; s.onchange = () => set(key, s.value); r.appendChild(s);
  refreshers.push(() => { const o = optsFn(); s.innerHTML = o.map((x) => `<option value="${x.id}">${x.label}</option>`).join(""); s.value = st[key]; });
}
function check(parent, label, key) {
  const l = document.createElement("label"); l.className = "chk"; l.innerHTML = `<input type="checkbox" data-k="${key}"> ${label}`;
  const i = l.firstChild; i.onchange = () => set(key, i.checked); parent.appendChild(l); const rf = () => { i.checked = !!st[key]; }; refreshers.push(rf); rf();
}
function num(parent, label, key, min, max) {
  const r = row(parent, label), i = document.createElement("input"); i.type = "number"; i.min = min; i.max = max; i.dataset.k = key;
  i.onchange = () => set(key, Math.max(min, Math.min(max, +i.value || 0))); r.appendChild(i); const rf = () => { i.value = st[key]; }; refreshers.push(rf); rf();
}
function buildControls() {
  const L = (a) => a.map((id) => ({ id, label: id }));
  group("View", true, (b) => {
    seg(b, "Camera", S.CAMERAS, "camera"); seg(b, "Time", S.TIMES, "time"); seg(b, "Viewer", S.VIEWS, "view");
    seg(b, "Width", [{ id: "phone", label: "Phone 390" }, { id: "desktop", label: "Desktop" }], "width"); check(b, "Reduced motion", "reduced");
    const r = row(b, "Render"); const a = document.createElement("a"); a.className = "btn"; a.href = "?fallback=1"; a.textContent = "Force 2D fallback"; const a2 = a.cloneNode(); a2.href = "./"; a2.textContent = "Try 3D"; r.append(a, a2);
  });
  group("Game", false, (b) => {
    seg(b, "State", S.GAME_STATES.map((g) => ({ id: g.id, label: g.id })), "game");
    select(b, "Home", L(S.GUERNSEYS), "home"); select(b, "Away", L(S.GUERNSEYS), "away");
    num(b, "Home goals", "hg", 0, 30); num(b, "Home behinds", "hb", 0, 30); num(b, "Away goals", "ag", 0, 30); num(b, "Away behinds", "ab", 0, 30); num(b, "Quarter", "quarter", 1, 4);
  });
  group("Leg and bookie", false, (b) => {
    seg(b, "Leg state", S.LEG_STATES.map((l) => ({ id: l.id, label: l.label })), "legState");
    const r = row(b, "Progress"); const i = document.createElement("input"); i.type = "range"; i.min = 0; i.max = 40; i.dataset.k = "current"; i.oninput = () => { st.current = +i.value; renderHud(); }; r.appendChild(i); refreshers.push(() => { i.value = st.current; }); 
    check(b, "Multi (4 legs, summary bar)", "multi"); select(b, "Bookie mark", L(S.BOOKIES), "bookie");
  });
  group("Sponsors", false, (b) => { check(b, "Ground boards and logo", "boards"); check(b, "Ball patch", "ballPatch"); check(b, "Club emblems", "emblems"); seg(b, "Win style", S.WIN_STYLES, "winStyle"); });
  group("Sport, ball and player", false, (b) => {
    select(b, "Sport (14)", S.SPORTS.map((x) => ({ id: x.id, label: x.label })), "sport");
    dyn(b, "Ball", "ball", () => S.byId(S.SPORTS, st.sport).balls.map((id) => ({ id, label: id })));
    dyn(b, "Player clip", "clip", () => S.sportClips(st.sport).map((id) => { const n = (S.byId(S.SPORTS, st.sport).approx || {})[id]; return { id, label: id + (n ? " (approx: " + n + ")" : "") }; }));
    const n = document.createElement("div"); n.className = "note"; n.id = "clipnote"; b.appendChild(n);
    refreshers.push(() => { const sp = S.byId(S.SPORTS, st.sport), have = S.sportClips(st.sport); n.innerHTML = `<b>${have.length} of ${S.CLIPS.length} clips fit ${sp.label}.</b> Not available for this sport: ${sp.missing.join(", ")}. Hidden because they belong to other sports: ${S.sportMissing(st.sport).join(", ") || "none"}.`; });
  });
  group("Ground", false, (b) => {
    dyn(b, "Ground / venue", "course", () => S.VENUES.map((v) => ({ id: v.id, label: (v.kind === "real" ? "REAL " : "STAND-IN ") + v.name + (v.id === "none" ? " (not the MCG)" : "") + (v.id === "mcg" && st.mcg === "missing" ? " - file not found" : "") })));
    const t = document.createElement("table"); t.className = "venues"; t.innerHTML = "<tr><th>Model</th><th>Status</th><th>File</th></tr>" + S.VENUES.map((v) => `<tr class="${v.kind}"><td>${v.name}</td><td><b>${v.kind === "real" ? "REAL" : "STAND-IN"}</b></td><td>${v.file}<br><small>${v.source}</small></td></tr>`).join("");
    b.appendChild(t);
  });
  group("Effects", true, (b) => {
    const r = row(b); S.EFFECTS.forEach((e) => { const x = document.createElement("button"); x.type = "button"; x.className = "btn"; x.textContent = e.label; x.dataset.fx = e.id; x.onclick = () => trigger(e.id); r.appendChild(x); });
  });
  refreshers.forEach((f) => f());
}

/* ---------- 2D effects layer (shared by both scenes) ---------- */
const stageEl = () => $("stage");
function anim(el, kf, opt) { const a = el.animate(kf, { fill: "forwards", ...opt }); a.finished.then(() => el.remove()).catch(() => el.remove()); return a; }
function mk(cls, html) { const d = document.createElement("div"); d.className = cls; if (html) d.innerHTML = html; $("fx").appendChild(d); return d; }
function flash(color, peak, ms) { const f = mk("flash"); f.style.background = color; anim(f, [{ opacity: 0 }, { opacity: st.reduced ? peak * 0.4 : peak, offset: 0.12 }, { opacity: 0 }], { duration: ms }); }
function badge(text, color, ms) {
  const b = mk("badge", text); b.style.setProperty("--bc", color);
  anim(b, st.reduced ? [{ opacity: 0 }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.1 }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.8 }, { opacity: 0, transform: "translate(-50%,-50%) scale(1)" }]
    : [{ opacity: 0, transform: "translate(-50%,-50%) scale(.2) rotate(-6deg)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1.25) rotate(2deg)", offset: 0.18 }, { opacity: 1, transform: "translate(-50%,-50%) scale(1) rotate(0)", offset: 0.3 }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.8 }, { opacity: 0, transform: "translate(-50%,-60%) scale(1.1)" }], { duration: ms });
}
function shake() { if (st.reduced) return; const s = stageEl(); s.classList.remove("shake"); void s.offsetWidth; s.classList.add("shake"); setTimeout(() => s.classList.remove("shake"), 400); }
const parts = []; let partRaf = 0;
function burst(n, x, y, kind) {
  if (st.reduced) return;
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 160 + Math.random() * 300; parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 4 + Math.random() * 4, spin: Math.random() * 6, vs: 6 + Math.random() * 8, life: 0, max: 1.8 + Math.random() * 0.8, kind: kind === "coin" || Math.random() < 0.5 ? "coin" : "conf", hue: 190 + Math.random() * 170 }); }
  if (!partRaf) { let last = performance.now(); const c = $("fxc"); const loop = (t) => {
    const dt = Math.min(0.05, (t - last) / 1000); last = t; const dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; } const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life += dt; p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.spin += p.vs * dt; if (p.life > p.max || p.y > h + 20) { parts.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, (p.max - p.life) * 2); const sq = Math.abs(Math.cos(p.spin));
      if (p.kind === "coin") { g.fillStyle = "#ffd54a"; g.strokeStyle = "#b8860b"; g.beginPath(); g.ellipse(p.x, p.y, p.r * Math.max(0.15, sq), p.r, 0, 0, 7); g.fill(); g.stroke(); }
      else { g.fillStyle = `hsl(${p.hue},85%,60%)`; g.save(); g.translate(p.x, p.y); g.rotate(p.spin); g.fillRect(-p.r, -p.r / 2, p.r * 2, p.r * sq + 1); g.restore(); } }
    if (parts.length) partRaf = requestAnimationFrame(loop); else { partRaf = 0; g.clearRect(0, 0, w, h); } }; partRaf = requestAnimationFrame(loop); }
}
function countUp(el, to, ms) { const t0 = performance.now(); const f = (t) => { const k = Math.min(1, (t - t0) / ms); el.textContent = "+" + (to * (1 - Math.pow(1 - k, 3))).toFixed(1) + "U"; if (k < 1) requestAnimationFrame(f); }; f(t0); }
function winOverlay() {
  note("win-start"); const w = stageEl().clientWidth, h = stageEl().clientHeight;
  const band = mk("winband", `SPONSOR WIN<small>${SPONSOR} (TEST)</small>`);
  anim(band, st.reduced ? [{ transform: "translateX(0) skewX(0)" }, { transform: "translateX(0) skewX(0)" }] : [{ transform: "translateX(-120%) skewX(-8deg)" }, { transform: "translateX(0) skewX(-8deg)", offset: 0.22, easing: "ease-out" }, { transform: "translateX(0) skewX(-8deg)", offset: 0.8 }, { transform: "translateX(120%) skewX(-8deg)" }], { duration: 3200 });
  const cnt = mk("wincount", "+0.0U"); anim(cnt, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: 3200 }); countUp(cnt, S.WIN_UNITS, 1300);
  flash("#ffd54a", 0.35, 600); burst(70, w / 2, h * 0.5, "coin"); setTimeout(() => burst(50, w * 0.25, h * 0.7), 450); setTimeout(() => burst(50, w * 0.75, h * 0.7), 700);
  $("hud").dataset.winning = "1"; renderHud(); setTimeout(() => { delete $("hud").dataset.winning; renderHud(); note("win-end"); }, 3200);
}
function goalOverlay(isGoal) {
  note(isGoal ? "goal-fx" : "behind-fx");
  flash(isGoal ? "#ffffff" : "#ffe27a", isGoal ? 0.9 : 0.5, isGoal ? 600 : 450);
  badge(isGoal ? "GOAL!" : "BEHIND", isGoal ? "#ffffff" : "#ffd54a", isGoal ? 1800 : 1300);
  if (isGoal) { shake(); burst(40, stageEl().clientWidth / 2, stageEl().clientHeight * 0.45, "conf"); }
}
function trigger(id) {
  note("trigger-" + id); if (!scene2) return;
  if (id === "goal" || id === "behind") scene2.kick(id === "goal", () => goalOverlay(id === "goal"));
  else if (id === "flyby") scene2.flyby();
  else if (id === "win") { scene2.winPulse(); winOverlay(); }
}

/* ---------- 3D scene ---------- */
function texCanvas(w, h, draw) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
async function start3D(renderer) {
  const host = $("gl-host"); host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.3, 600);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x446644, 1), sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(-20, 40, 20); scene.add(hemi, sun);
  const flood = [[-26, 22, -34], [26, 22, 34]].map(([x, y, z]) => { const l = new THREE.SpotLight(0xfff4d6, 0, 0, 0.9, 0.4, 0); l.position.set(x, y, z); l.target.position.set(0, 0, 0); scene.add(l, l.target); return l; });
  const pitch = new THREE.Group(); scene.add(pitch); const courseG = new THREE.Group(); scene.add(courseG);
  const RX = 24, RZ = 33;
  const grass = texCanvas(256, 256, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#2f8f4e" : "#37a05a"; g.fillRect(0, (i * h) / 8, w, h / 8); } });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshLambertMaterial({ map: grass })); ground.rotation.x = -Math.PI / 2; ground.scale.set(RX, RZ, 1); ground.rotation.z = 0;
  ground.rotation.set(-Math.PI / 2, 0, 0); ground.scale.set(RX, RZ, 1); pitch.add(ground);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x24633a })); outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; pitch.add(outer);
  const line = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); line.rotation.x = -Math.PI / 2; line.position.y = 0.03; line.scale.set(RX, RZ, 1); pitch.add(line);
  const cc = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.5, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); cc.rotation.x = -Math.PI / 2; cc.position.y = 0.03; pitch.add(cc);
  const stands = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 7, 48, 1, true), new THREE.MeshLambertMaterial({ color: 0x3a4660, side: THREE.BackSide })); stands.scale.set(RX + 9, 1, RZ + 9); stands.position.y = 3.5; pitch.add(stands);
  const sponsors = [SPONSOR, "NEILL DATA TEST", "FAKE BANK", "TEST COLA"];
  const boardMats = sponsors.map((n, i) => new THREE.MeshStandardMaterial({ map: texCanvas(512, 80, (g, w, h) => { g.fillStyle = ["#1d4ed8", "#0f766e", "#b91c1c", "#6d28d9"][i]; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.font = "bold 52px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(n, w / 2, h / 2 + 2); }), emissive: 0xffffff, emissiveIntensity: 0 }));
  boardMats.forEach((m) => { m.emissiveMap = m.map; });
  const boards = new THREE.Group(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), boardMats[i % 4]); m.position.set(Math.sin(a) * (RX + 1), 0.6, Math.cos(a) * (RZ + 1)); m.rotation.y = a + Math.PI; m.material.side = THREE.DoubleSide; boards.add(m); } pitch.add(boards);
  const logoMat = new THREE.MeshStandardMaterial({ map: texCanvas(512, 160, (g, w, h) => { g.fillStyle = "#ffffffcc"; g.font = "bold 96px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(SPONSOR, w / 2, h / 2); }), transparent: true, emissive: 0xffffff, emissiveIntensity: 0 }); logoMat.emissiveMap = logoMat.map;
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.75), logoMat); logo.rotation.x = -Math.PI / 2; logo.position.set(0, 0.05, 0); pitch.add(logo);
  const emblems = new THREE.Group(); [[-1, st.home], [1, st.away]].forEach(([s, id]) => { const m = new THREE.Mesh(new THREE.CircleGeometry(2, 32), new THREE.MeshBasicMaterial({ color: club(id).primary })); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.04, s * 14); m.name = id; emblems.add(m); const r = new THREE.Mesh(new THREE.RingGeometry(2, 2.4, 32), new THREE.MeshBasicMaterial({ color: club(id).secondary, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2; r.position.set(0, 0.045, s * 14); emblems.add(r); }); pitch.add(emblems);
  const postMat = new THREE.MeshLambertMaterial({ color: 0xffffff }); const nets = {};
  [-1, 1].forEach((s) => {
    [[-3.2, 6], [3.2, 6], [-9.6, 3], [9.6, 3]].forEach(([x, h]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, h * 1.5, 8), postMat); p.position.set(x, h * 0.75, s * 30); pitch.add(p); });
    const geo = new THREE.PlaneGeometry(6.4, 4, 16, 10); const net = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.55, side: THREE.DoubleSide })); net.position.set(0, 2.2, s * 32.5); pitch.add(net); nets[s] = { mesh: net, base: geo.attributes.position.array.slice(), t: -1 };
  });
  // players
  const base = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync("models/player-v2.1.glb");
  const kitFor = (id) => { const c = club(id); return { jumper: { pattern: ["hoops", "sash"].includes(c.pattern) ? c.pattern : "plain", colors: [c.primary, c.secondary], bands: 6 }, shorts: c.secondary, socks: { base: c.primary, top: c.secondary } }; };
  const players = [];
  const addPlayer = (id, x, z, sc, clipName) => {
    const mats = kitMaterials(base.scene, kitFor(id)), obj = dressedPlayer(base.scene, mats); obj.position.set(x, 0, z); obj.scale.setScalar(sc); pitch.add(obj);
    const mixer = new THREE.AnimationMixer(obj), p = { obj, mixer, actions: {}, id, cur: null }; p.play = (name) => { const clip = base.animations.find((c) => c.name === name); if (!clip) return; const a = mixer.clipAction(clip); a.reset(); const loop = S.LOOP_CLIPS.includes(name); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; if (p.cur && p.cur !== a) p.cur.fadeOut(0.2); a.fadeIn(0.2).play(); p.cur = a; if (!loop) { const done = (e) => { if (e.action === a) { mixer.removeEventListener("finished", done); p.play("idle"); } }; mixer.addEventListener("finished", done); } }; p.play(clipName); players.push(p); return p;
  };
  const main = addPlayer(st.home, -3, 4, 2.2, st.clip); const side = [addPlayer(st.away, 5, -6, 1, "run"), addPlayer(st.home, -6, -9, 1, "idle")];
  const sideClips = () => side[0].play(S.sportClips(st.sport).includes("run") ? "run" : "idle");
  const recolour = () => { main.obj.traverse((o) => { if (o.isMesh && o.material.name === "jumper") o.material.map = kitMaterials(base.scene, kitFor(st.home)).jumper.map; }); };
  // balls
  const balls = {}; const sponsorTex = texCanvas(512, 512, (g, w, h) => { g.fillStyle = "#ff6a00"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.font = "bold 150px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("QKA", w / 2, h / 2); });
  const onFooty = () => st.course === "none" || st.course === "mcg";
  let ballObj = null; const KICK = new THREE.Vector3(0, 0.3, 8);
  const getBall = async (id) => (balls[id] = balls[id] || (await loadBall(id, "models/balls")).object);
  const setBall = async () => {
    const proto = await getBall(st.ball); const o = proto.clone(true); if (st.ballPatch) applySponsorTexture(o, sponsorTex); o.scale.setScalar(3); o.position.copy(KICK); o.position.y = 0.45;
    if (ballObj) pitch.remove(ballObj); ballObj = o; ballObj.visible = onFooty(); pitch.add(o);
  };
  await setBall();
  // course
  const courses = {}; let courseObj = null, mcgObj = null, mcgProto = null;
  const procedural = [ground, outer, line, cc, stands];
  const loadMcg = async () => {
    if (mcgProto || st.mcg === "missing") return;
    try {
      const o = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync("models/mcg.glb")).scene; o.updateMatrixWorld(true);
      const f = o.getObjectByName("Field") || o, fb = new THREE.Box3().setFromObject(f), fs = fb.getSize(new THREE.Vector3()), fc = fb.getCenter(new THREE.Vector3());
      const g = new THREE.Group(); o.position.set(-fc.x, -fb.max.y, -fc.z); g.add(o); if (fs.x > fs.z) g.rotation.y = Math.PI / 2; g.scale.setScalar((2 * RZ) / Math.max(fs.x, fs.z)); mcgProto = g; st.mcg = "ok";
    } catch (e) { st.mcg = "missing"; }
    renderHud(); refreshers.forEach((f) => f());
  };
  const setCourse = async () => {
    if (courseObj) courseG.remove(courseObj); courseObj = null; if (mcgObj) pitch.remove(mcgObj); mcgObj = null;
    const isMcg = st.course === "mcg"; if (isMcg) await loadMcg();
    const useMcg = isMcg && st.mcg === "ok"; procedural.forEach((m) => { m.visible = !useMcg; });
    if (useMcg) { mcgObj = mcgProto.clone(true); pitch.add(mcgObj); }
    const on = st.course !== "none" && !isMcg; pitch.visible = !on;
    if (!on) return;
    if (!courses[st.course]) courses[st.course] = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`models/racecourses/${st.course}.glb`)).scene;
    const o = courses[st.course].clone(true); const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()); const k = 64 / Math.max(size.x, size.z);
    const g = new THREE.Group(); o.position.sub(c); g.add(o); g.scale.setScalar(k); courseObj = g; courseG.add(g);
  };
  // camera
  const cp = new THREE.Vector3(), cl = new THREE.Vector3(), tp = new THREE.Vector3(), tl = new THREE.Vector3();
  const aim = (snap) => { const c = S.byId(S.CAMERAS, st.camera); const f = mcgObj ? 1.1 : 1; tp.set(c.pos[0] * f, c.pos[1] * (mcgObj ? 3.4 : 1), c.pos[2] * f); tl.set(...c.look); if (snap || st.reduced) { cp.copy(tp); cl.copy(tl); } main.obj.rotation.y = Math.atan2(c.pos[0] - main.obj.position.x, c.pos[2] - main.obj.position.z); };
  const applyTime = () => { const n = st.time === "night"; const bg = new THREE.Color(n ? 0x070b14 : 0x8fc1ee); scene.background = bg; scene.fog = new THREE.Fog(bg, 90, 300); hemi.intensity = n ? 0.22 : 1; sun.intensity = n ? 0.03 : 2; flood.forEach((l) => { l.intensity = n ? 1.1 : 0; }); logoMat.emissiveIntensity = n ? 0.6 : 0; boardMats.forEach((m) => { m.emissiveIntensity = n ? 0.7 : 0; }); };
  const syncVis = () => { boards.visible = st.boards; logo.visible = st.boards; emblems.visible = st.emblems; if (ballObj) ballObj.visible = onFooty(); };
  aim(true); applyTime(); syncVis();
  // effects
  let fb = null, flight = null, glowT = -1;
  const goalZ = () => S.goalEnd(S.byId(S.CAMERAS, st.camera).pos) * 30;
  const impl = {
    mode: "webgl",
    async apply(k) {
      if (k === "camera") aim(); else if (k === "time") applyTime(); else if (k === "clip") main.play(st.clip); else if (k === "sport") { await setBall(); main.play(st.clip); sideClips(); }
      else if (k === "ball" || k === "ballPatch") await setBall(); else if (k === "course") { await setCourse(); aim(); }
      else if (k === "home") { main.id = st.home; recolour(); emblems.children.forEach((m) => { if (m.name) m.material.color.set(club(m.position.z < 0 ? st.home : st.away).primary); }); } else if (k === "away") emblems.children.forEach((m) => { if (m.name && m.position.z > 0) m.material.color.set(club(st.away).primary); });
      syncVis();
    },
    kick(isGoal, cb) {
      if (!ballObj || !onFooty()) { cb(); return; } const z = goalZ(); const to = new THREE.Vector3(isGoal ? 0 : 6.4, isGoal ? 2.4 : 2.6, z); flight = { t: 0, dur: st.reduced ? 0.25 : 0.9, from: ballObj.position.clone(), to, isGoal, cb };
      const gc = S.byId(S.SPORTS, st.sport).goal; if (gc) main.play(gc); },
    flyby() { startFly(new THREE.Vector3(0, 1.2, 0)); },
    winPulse() { glowT = 0; const wc = S.byId(S.SPORTS, st.sport).win; if (wc) main.play(wc); },
  };
  const startFly = (from) => { if (fb) fb.cancel(); const proto = balls[st.ball]; if (!proto) return; fb = startBallFlyby({ scene, camera, ball: proto.clone(true), from, sport: st.ball, sponsorTexture: st.ballPatch ? sponsorTex : undefined, scale: 1, onDone: () => { note("flyby-done"); } }); note("flyby-start"); };
  // loop
  const resize = () => { const w = $("stage").clientWidth, h = $("stage").clientHeight; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe($("stage")); resize();
  let last = performance.now(); let frames = 0;
  const loop = (t) => {
    const dt = Math.min(0.05, (t - last) / 1000); last = t; frames++;
    const k = st.reduced ? 1 : 1 - Math.exp(-5 * dt); cp.lerp(tp, k); cl.lerp(tl, k); camera.position.copy(cp); camera.lookAt(cl);
    players.forEach((p) => p.mixer.update(dt));
    if (flight) { flight.t += dt; const u = Math.min(1, flight.t / flight.dur); ballObj.position.lerpVectors(flight.from, flight.to, u); ballObj.position.y += Math.sin(u * Math.PI) * 4; ballObj.rotation.x += dt * 12;
      if (u >= 1) { const f = flight; flight = null; if (f.isGoal) nets[Math.sign(f.to.z)].t = 0; f.cb(); if (f.isGoal) startFly(f.to.clone()); setTimeout(() => { if (ballObj) { ballObj.position.copy(KICK); ballObj.position.y = 0.45; ballObj.rotation.set(0, 0, 0); } }, 900); } }
    Object.entries(nets).forEach(([sg, n]) => { n.mesh.visible = !(Math.sign(camera.position.z) === +sg && Math.abs(camera.position.z) > 32.5); if (n.t < 0) return; n.t += dt; const pa = n.mesh.geometry.attributes.position, a = pa.array; const amp = Math.exp(-2.6 * n.t) * 1.3;
      for (let i = 0; i < a.length; i += 3) { const dx = n.base[i], dy = n.base[i + 1] - 0.2, d = Math.hypot(dx, dy); a[i + 2] = amp * Math.sin(9 * d - 16 * n.t) * Math.exp(-0.35 * d); } pa.needsUpdate = true; if (n.t > 2.4) { n.t = -1; for (let i = 0; i < a.length; i += 3) a[i + 2] = 0; pa.needsUpdate = true; } });
    if (glowT >= 0) { glowT += dt; const e = Math.max(0, 1 - glowT / 3.2) * (0.7 + 0.3 * Math.sin(glowT * 14)); const base = st.time === "night" ? 0.6 : 0; logoMat.emissiveIntensity = base + e * 1.4; boardMats.forEach((m) => { m.emissiveIntensity = (st.time === "night" ? 0.7 : 0) + e * 1.2; }); if (glowT > 3.2) { glowT = -1; applyTime(); } }
    if (fb && !fb.done) fb.update(dt);
    renderer.render(scene, camera); requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  impl.frames = () => frames; impl.dbg = { scene, camera, main, players, get ball() { return ballObj; } };
  return impl;
}

/* ---------- 2D fallback scene ---------- */
const BALL_COL = { afl: "#c8431c", "american-football": "#7a3b1d", baseball: "#f3efe6", basketball: "#e07a1f", "cricket-red": "#b3202a", "cricket-white": "#f1f1f1", golf: "#ffffff", "ice-hockey-puck": "#111111", netball: "#e8a33a", "rugby-league": "#e8e2d0", "rugby-union": "#e6e6e6", soccer: "#fafafa", softball: "#d7e84a", "table-tennis": "#f6a23a", tennis: "#cde21c", volleyball: "#f2d65b", "water-polo": "#e5c93d" };
const CAM2D = { broadcast: "translate(0 38) scale(1 .72)", north: "translate(-45 -38) scale(1.3 .6)", south: "translate(-45 28) scale(1.3 .6)", wing: "translate(0 20) scale(1 .5)", blimp: "translate(0 0) scale(1 1)" };
function start2D() {
  const svg = $("s2d"); svg.removeAttribute("hidden");
  svg.innerHTML = `<rect id="f-bg" width="300" height="220"/><g id="f-cam" style="transition:transform .5s"><ellipse cx="150" cy="110" rx="120" ry="82" fill="#2f8f4e" stroke="#fff" stroke-width="1.5"/><ellipse cx="150" cy="110" rx="18" ry="12" fill="none" stroke="#fff"/>
  <g id="f-course" display="none"><path id="f-track" fill="none" stroke="#c9a66b" stroke-width="10"/><text id="f-cname" x="150" y="112" text-anchor="middle" fill="#fff" font-size="11"></text></g>
  <g id="f-ground"><g stroke="#fff" stroke-width="2"><path d="M144 30V12M156 30V12M132 30V22M168 30V22"/><path d="M144 190V208M156 190V208M132 190V198M168 190V198"/></g>
  <rect id="f-net" x="143" y="6" width="14" height="10" fill="none" stroke="#fff" stroke-dasharray="2 2"/>
  <g id="f-boards"><rect x="62" y="22" width="40" height="8" fill="#1d4ed8"/><rect x="198" y="22" width="40" height="8" fill="#b91c1c"/><rect x="62" y="190" width="40" height="8" fill="#0f766e"/><rect x="198" y="190" width="40" height="8" fill="#6d28d9"/><text x="150" y="116" text-anchor="middle" fill="#ffffffaa" font-size="14" font-weight="bold" id="f-logo">${SPONSOR}</text></g>
  <g id="f-emb"><circle id="f-e1" cx="150" cy="70" r="9"/><circle id="f-e2" cx="150" cy="150" r="9"/></g>
  <image id="f-p1" x="100" y="112" width="40" height="40"/><image id="f-p2" x="170" y="60" width="26" height="26"/><text id="f-clip" x="120" y="162" text-anchor="middle" fill="#fff" font-size="9"></text>
  <circle id="f-ball" cx="165" cy="140" r="6" stroke="#0006"/></g></g><rect id="f-night" width="300" height="220" fill="#050a18" opacity="0" pointer-events="none"/>`;
  const q = (id) => svg.querySelector("#" + id), set = (id, o) => Object.entries(o).forEach(([k, v]) => q(id).setAttribute(k, v));
  const refresh = () => {
    set("f-bg", { fill: st.time === "night" ? "#070b14" : "#8fc1ee" }); q("f-night").setAttribute("opacity", st.time === "night" ? 0.45 : 0);
    q("f-cam").style.transform = ""; q("f-cam").setAttribute("transform", CAM2D[st.camera]);
    const on = !!S.byId(S.COURSES, st.course); q("f-course").setAttribute("display", on ? "" : "none"); q("f-ground").setAttribute("display", on ? "none" : "");
    if (on) { const c = S.byId(S.COURSES, st.course); q("f-cname").textContent = c.name + (c.circuit ? " " + c.circuit + "m" : " straight " + c.straight + "m"); q("f-track").setAttribute("d", c.circuit ? "M60 110a90 50 0 1 0 180 0a90 50 0 1 0-180 0Z" : "M30 110H270"); }
    q("f-boards").setAttribute("display", st.boards ? "" : "none"); q("f-emb").setAttribute("display", st.emblems ? "" : "none");
    set("f-e1", { fill: club(st.home).primary, stroke: club(st.home).secondary }); set("f-e2", { fill: club(st.away).primary, stroke: club(st.away).secondary });
    q("f-p1").setAttribute("href", GU + st.home + ".svg"); q("f-p2").setAttribute("href", GU + st.away + ".svg"); q("f-clip").textContent = S.byId(S.SPORTS, st.sport).label + " clip: " + st.clip;
    set("f-ball", { fill: BALL_COL[st.ball] || "#ddd", stroke: st.ballPatch ? "#ff6a00" : "#0006", "stroke-width": st.ballPatch ? 2.5 : 1 });
  };
  const A = (el, kf, opt) => el.animate(kf, { fill: "none", duration: st.reduced ? 80 : 700, ...opt });
  const impl = {
    mode: "2d", apply(k) { refresh(); if (k === "clip" && !st.reduced) A(q("f-p1"), [{ transform: "translateY(0)" }, { transform: "translateY(-8px)" }, { transform: "translateY(0)" }], { duration: 500 }); },
    kick(isGoal, cb) {
      const b = q("f-ball"), net = q("f-net"); const dx = isGoal ? 150 - 165 : 172 - 165, dy = 14 - 140; const a = A(b, [{ transform: "translate(0,0)" }, { transform: `translate(${dx}px,${dy}px) scale(.6)` }], { duration: st.reduced ? 80 : 800, easing: "ease-out" });
      a.finished.then(() => { cb(); if (isGoal) { A(net, [{ transform: "scaleY(1)" }, { transform: "scaleY(1.9)" }, { transform: "scaleY(.8)" }, { transform: "scaleY(1)" }], { duration: 900 }); impl.flyby(); } }); },
    flyby() { const b = q("f-ball"); note("flyby-start"); const a = b.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: "translate(-30px,-40px) scale(9)", opacity: 1, offset: 0.7 }, { transform: "translate(-140px,-80px) scale(14)", opacity: 0 }], { duration: st.reduced ? 120 : 1500, easing: "ease-in" }); a.finished.then(() => note("flyby-done")); },
    winPulse() { A(q("f-logo"), [{ fill: "#ffffffaa" }, { fill: "#ffd54a", transform: "scale(1.3)" }, { fill: "#ffffffaa" }], { duration: 3000 }); },
  };
  refresh(); return impl;
}

/* ---------- boot ---------- */
async function boot() {
  document.body.classList.toggle("reduced", st.reduced); $("wrap").className = "w-" + st.width;
  try { await new THREE.FileLoader().setResponseType("arraybuffer").loadAsync("models/mcg.glb"); st.mcg = "ok"; } catch (e) { st.mcg = "missing"; }
  buildControls(); renderHud(); $("btn-goal").onclick = () => trigger("goal"); $("btn-win").onclick = () => trigger("win");
  const forced = location.search.includes("fallback=1"); let renderer = null, failed3d = false;
  if (!forced) { const c = document.createElement("canvas"); let gl = null; try { gl = c.getContext("webgl2") || c.getContext("webgl"); } catch (e) { gl = null; } if (gl) { try { renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true }); } catch (e) { renderer = null; } } }
  if (renderer) { try { $("status").textContent = "Loading 3D models..."; scene2 = await start3D(renderer); $("status").textContent = "3D (WebGL)"; } catch (e) { console.warn("3D failed, using 2D: " + (e && e.message)); renderer = null; $("gl-host").innerHTML = ""; failed3d = true; } }
  if (!scene2) { scene2 = start2D(); $("status").textContent = forced ? "2D fallback (forced)" : failed3d ? "2D fallback (3D load failed)" : "2D fallback (no WebGL)"; }
  globalThis.__ta = { st, S, trigger, set, log, scene: scene2, mode: scene2.mode, ready: true };
}
boot().catch((e) => { $("status").textContent = "Error: " + e.message; console.error(e); });
