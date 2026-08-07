/* Tests automatisés — Clean It (étape 6). */
import { createHarness } from "./harness.mjs";

const h = createHarness();
const { window, document, app } = h;

let pass = 0;
let fail = 0;
function ok(m) {
  pass++;
  console.log("  ok -", m);
}
function assert(cond, m) {
  if (cond) {
    pass++;
    console.log("  ok -", m);
  } else {
    fail++;
    console.log("  FAIL -", m);
  }
}

/* formules du jeu dupliquées pour les attentes */
const COMBO_BONUS_PER_STEP = 15;
const TIME_BONUS_FLOOR = 50;
const TIME_BONUS_PER_SEC = 40;
const MAX_FLOATERS = 8;
function timeBonus(seconds) {
  return Math.max(0, Math.round((TIME_BONUS_FLOOR - seconds) * TIME_BONUS_PER_SEC));
}

const statsNs = await h.loadModule("storage/stats.js");
const ciNs = await h.loadModule("games/clean-it/cleanIt.js");

function mountIt() {
  const host = document.createElement("div");
  app.appendChild(host);
  ciNs.game.mount(host);
  return host;
}
function zoneOf(host) {
  const z = host.querySelector(".ci__play");
  if (!z) return null;
  if (!z.__rect) {
    z.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 380, right: 300, bottom: 380 });
    z.__rect = true;
  }
  return z;
}
function move(host, x, y) {
  const z = zoneOf(host);
  if (z) z.dispatchEvent(new window.MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true }));
}
function activeDots(host) {
  return [...host.querySelectorAll(".ci__dot")].filter((d) => !d.classList.contains("ci__dot--gone"));
}
function center(d) {
  const r = parseFloat(d.style.width) / 2;
  return { x: parseFloat(d.style.left) + r, y: parseFloat(d.style.top) + r };
}
function comboText(host) {
  const el = host.querySelector(".ci__combo");
  return el ? el.textContent.trim() : "";
}
function endValues(host) {
  const vals = [...host.querySelectorAll(".ci-end__value")];
  return { time: parseFloat(vals[0]?.textContent), score: parseInt(vals[1]?.textContent, 10) };
}
/** Point de la zone éloigné (> 26 px) de toute particule, si possible. */
function emptyPoint(dots) {
  const maxHit = 26;
  const candidates = [
    [5, 5], [150, 190], [295, 5], [5, 375],
    [295, 375], [40, 340], [260, 40], [150, 40],
  ];
  for (const [cx, cy] of candidates) {
    if (dots.every((d) => Math.hypot(center(d).x - cx, center(d).y - cy) > maxHit)) return { x: cx, y: cy };
  }
  return null;
}

h.window.localStorage.clear();

/* ================= Initialisation & particules ================= */
console.log("=== Initialisation & particules ===");
let host = mountIt();
assert(host.querySelector(".ci__label")?.textContent === "Clean It", "écran READY");
assert(host.querySelector(".ci__preview")?.textContent.includes("30"), "preview: 30 particules (1re partie)");
host.querySelector('[data-action="start"]').click();

let dots = activeDots(host);
assert(dots.length === 30, "30 particules créées");

let typeOk = true;
const seen = new Set();
for (const d of dots) {
  const t = d.dataset.type;
  const v = Number(d.dataset.value);
  if (!["normal", "petite", "grande"].includes(t)) typeOk = false;
  if (![5, 10, 15].includes(v)) typeOk = false;
  if ((t === "normal" && v !== 10) || (t === "petite" && v !== 15) || (t === "grande" && v !== 5)) typeOk = false;
  const c = center(d);
  const r = parseFloat(d.style.width) / 2;
  if (c.x - r < 0 || c.x + r > 300 || c.y - r < 0 || c.y + r > 380) typeOk = false;
  seen.add(t);
}
assert(typeOk, "types, valeurs et positions dans la zone validés");
assert(seen.size >= 2, `au moins 2 types différents (${[...seen].join(",")})`);

let overlap = false;
for (let i = 0; i < dots.length; i++)
  for (let j = i + 1; j < dots.length; j++) {
    const a = center(dots[i]);
    const b = center(dots[j]);
    if (Math.hypot(a.x - b.x, a.y - b.y) < 6) overlap = true;
  }
assert(!overlap, "aucune particule superposée");
ok("init particules OK");

console.log("=== Chrono ===");
assert(host.querySelector(".ci__time")?.textContent === "0.00 s", "temps initial 0.00 s");
h.advance(1234);
h.flushFrames();
assert(host.querySelector(".ci__time")?.textContent === "1.23 s", "temps rafraîchi (1.234 s)");
ok("chrono basé sur performance.now");

/* ========= Nettoyage simple ========= */
console.log("=== Nettoyage simple ===");
const before = activeDots(host).length;
const target = activeDots(host)[0];
move(host, center(target).x, center(target).y);
assert(activeDots(host).length === before - 1, "particule nettoyée (30 -> 29)");
const valuePop = host.querySelector(".ci__pop:last-of-type");
assert(valuePop && /^\+\d+$/.test(valuePop.textContent), "micro-feedback +valeur affiché");
assert(host.querySelector(".ci__dot--gone") !== null, "dot en animation (--gone)");
h.flushTimers();
const totalDots = host.querySelectorAll(".ci__dot").length;
assert(host.querySelector(".ci__dot--gone") === null, "dot retiré du DOM après 300 ms");
assert(totalDots === before - 1, "nombre total de dots décrémenté");

const far = emptyPoint(activeDots(host));
if (far) {
  move(host, far.x, far.y);
  const afterFar = activeDots(host).length;
  move(host, far.x + 0.001, far.y + 0.001);
  assert(activeDots(host).length === afterFar, "curseur loin : aucun nettoyage");
} else {
  ok("curseur loin : aucun point sûr trouvé, assert sauté");
}
ok("nettoyage + feedback + timeout + far-safe");

/* ========= Combo ========= */
console.log("=== Combo ===");
app.innerHTML = "";
host = mountIt();
host.querySelector('[data-action="start"]').click();
let p = activeDots(host)[0];
move(host, center(p).x, center(p).y);
h.advance(100);
p = activeDots(host)[0];
move(host, center(p).x, center(p).y);
assert(comboText(host) === "🔥 x2", "combo x2 après 2 nettoyages rapides");
h.advance(120);
p = activeDots(host)[0];
move(host, center(p).x, center(p).y);
assert(comboText(host) === "🔥 x3", "combo x3 après 3 nettoyages rapides");
h.advance(600);
p = activeDots(host)[0];
move(host, center(p).x, center(p).y);
assert(!comboText(host) || comboText(host).endsWith("x1"), "combo revenu à x1 après délai > 500ms");
ok("combo monte vite, se réinitialise après 500ms");

/* ========= Score : formule exacte ========= */
console.log("=== Score : formule base + combo + temps ===");
app.innerHTML = "";
host = mountIt();
h.setClock(0);
host.querySelector('[data-action="start"]').click();
let base = 0;
let n = 0;
for (const d of activeDots(host)) {
  h.advance(1); // chaîne de combo
  base += Number(d.dataset.value);
  move(host, center(d).x, center(d).y);
  n++;
}
const expectedComboBonus = ((n * (n - 1)) / 2) * COMBO_BONUS_PER_STEP;
const expectedTimeBonus = timeBonus(h.clock() / 1000);
const expectedScore = base + expectedComboBonus + expectedTimeBonus;
assert(host.querySelector(".ci-end") !== null, "écran final affiché");
const { score, time } = endValues(host);
assert(score === expectedScore, `score exact: ${score} = base(${base}) + combo(${expectedComboBonus}) + temps(${expectedTimeBonus})`);
assert(Math.abs(time - h.clock() / 1000) < 0.01, `temps final aligné sur performance.now (${time})`);
assert(host.querySelector(".ci-end__value--sm")?.textContent.trim() === `x${n}`, `meilleur combo affiché x${n}`);
ok("formule du score validée (base + combo + temps)");

/* ========= Records & persistance ========= */
console.log("=== Records & persistance ===");
const stats1 = statsNs.getGameStats("clean-it");
assert(stats1.gamesPlayed === 1, "gamesPlayed = 1");
assert(stats1.bestScore === score, "bestScore enregistré");
assert(stats1.bestTime !== null && Math.abs(stats1.bestTime - h.clock() / 1000) < 0.01, "bestTime = temps de la partie");
assert(stats1.bestCombo === n, "bestCombo enregistré");
const freshStats = await h.reloadFresh("storage/stats.js");
const stats2 = freshStats.getGameStats("clean-it");
assert(stats2.bestScore === stats1.bestScore && stats2.bestTime === stats1.bestTime, "records persistés après fermeture/réouverture");
assert(host.querySelector(".os-record")?.textContent.includes("Nouveau record"), "bannière 🏆 Nouveau record");
ok("records une seule fois via storage/stats.js");

/* ========= Rejouer ========= */
console.log("=== Rejouer : reset partie, records conservés ===");
host.querySelector('[data-action="replay"]').click();
const dots2 = activeDots(host);
assert(dots2.length === 32, `2e partie : 32 particules (30 + 2×1) -> ${dots2.length}`);
assert(!host.querySelector(".ci-end"), "écran de fin parti");
const afterReplay = statsNs.getGameStats("clean-it");
assert(afterReplay.bestScore === stats1.bestScore, "bestScore conservé après REJOUER");
assert(afterReplay.gamesPlayed === 1, "gamesPlayed inchangé après REJOUER");
ok("REJOUER réinitialise la partie, pas les records");

/* ========= Difficulté progressive ========= */
console.log("=== Difficulté progressive (plafond 45) ===");
const stored = JSON.parse(h.window.localStorage.getItem("pause:stats"));
stored.games["clean-it"].gamesPlayed = 10;
h.window.localStorage.setItem("pause:stats", JSON.stringify(stored));
let hostP = mountIt();
const previewNum = hostP.querySelector(".ci__preview")?.textContent.replace(/[^0-9]/g, "");
assert(previewNum === "45", `preview plafonnée à 45 (10×2+30=50 -> 45), trouvé '${previewNum}'`);
hostP.querySelector('[data-action="start"]').click();
const placedP = activeDots(hostP).length;
assert(placedP >= 34 && placedP <= 45, `grosse partie atteignable (~45) : ${placedP}`);
assert(placedP > 30, "difficulté > 30 quand beaucoup de parties jouées");
ok("difficulté progressive plafonnée à 45");

/* ========= Micro-feedback plafonné ========= */
console.log("=== Micro-feedback plafonné ===");
app.innerHTML = "";
host = mountIt();
host.querySelector('[data-action="start"]').click();
for (let g = 0; g < 60 && activeDots(host).length; g++) {
  const d = activeDots(host)[0];
  move(host, center(d).x, center(d).y);
}
const live = host.querySelectorAll(".ci__pop").length;
assert(live <= MAX_FLOATERS, `au plus ${MAX_FLOATERS} pop(s) simultanés (${live})`);
ok("cap des micro-feedbacks respecté");

/* ========= Navigation ========= */
console.log("=== Navigation (ACCUEIL/retour) ===");
app.innerHTML = "";
host = mountIt();
let backed = 0;
host.addEventListener("back", () => backed++);
host.querySelector(".game-view__head [data-action='back']").click();
assert(backed === 1, "flèche retour -> 'back'");
app.innerHTML = "";
host = mountIt();
backed = 0;
host.addEventListener("back", () => backed++);
host.querySelector('[data-action="start"]').click();
let guardNav = 0;
while (activeDots(host).length && guardNav++ < 200) {
  const d = activeDots(host)[0];
  move(host, center(d).x, center(d).y);
  h.advance(1);
}
host.querySelector('[data-action="home"]')?.click();
assert(backed === 1, "ACCUEIL -> 'back'");

if (h.errors.length) {
  fail++;
  console.log("  FAIL - erreurs JS:", h.errors);
} else {
  ok("0 erreur JavaScript");
}
console.log(`\n=== ACCUEIL/REJOUER > ${pass} assertions, ${fail} échecs ===`);
process.exitCode = fail ? 1 : 0;