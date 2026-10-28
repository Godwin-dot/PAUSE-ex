/* Tests automatisés — Don't Touch : qualité du contrôle souris.
   Couvre : conversion, clamp, position, fluidité (interpolation),
   collision cercle vs rectangle, tolérance, armement, cleanup, nav. */
import { createHarness } from "./harness.mjs";

const h = createHarness();
const { window, document, app } = h;

let pass = 0;
let fail = 0;
function assert(cond, m) {
  if (cond) {
    pass++;
    console.log("  ok -", m);
  } else {
    fail++;
    console.log("  FAIL -", m);
  }
}
function ok(m) {
  assert(true, m);
}
function near(a, b, eps = 0.5) {
  return Math.abs(a - b) <= eps;
}

const statsNs = await h.loadModule("storage/stats.js");
const mod = await h.loadModule("games/don-touch/dontTouch.js");
const { game, PLAYER_RADIUS, COLLISION_TOLERANCE, scoreForTime } = mod;

/* formule dupliquée pour les attentes (socle + bonus vitesse plafonné) */
const SCORE_BASE = 200;
const SCORE_FLOOR_S = 40;
const SCORE_PER_S = 5;
function expectedScore(seconds) {
  return SCORE_BASE + Math.max(0, Math.round((SCORE_FLOOR_S - seconds) * SCORE_PER_S));
}
function dtStats() {
  return statsNs.getGameStats("don-touch");
}
/** Termine une partie gagnante : armage puis cible, timers flushés. */
function winRun(msElapsed) {
  play();
  arm();
  const tg = center(rectOf(host.querySelector(".dt__target")));
  h.advance(msElapsed); // le chrono avance entre l'armement et la cible
  moveTo(tg.x, tg.y);
  h.flushTimers();
  return msElapsed / 1000;
}

const host = document.createElement("div");
app.appendChild(host);
game.mount(host);

/** Remonte puis démarre une partie toute neuve (retour à PLAYING). */
function play() {
  game.mount(host); // unbind précédent -> READY
  host.querySelector('[data-action="start"]').click();
}

function rectOf(el) {
  return {
    x: parseFloat(el.style.left),
    y: parseFloat(el.style.top),
    w: parseFloat(el.style.width),
    h: parseFloat(el.style.height),
  };
}
function obstacles() {
  return [...host.querySelectorAll(".dt__obs")].map(rectOf);
}
function pickOb() {
  // obstacle avec un bord gauche assez écarté pour des sondes dans la zone
  return obstacles().find((o) => o.x >= 14 && o.y >= 4 && o.y + o.h <= 336);
}
function dotPos() {
  const el = host.querySelector(".dt__dot");
  if (!el) return null;
  const m = (el.style.transform || "").match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
}
function center(r) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
function moveTo(x, y) {
  host.querySelector(".dt__play").dispatchEvent(
    new window.MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true })
  );
}
function resultKind() {
  const el = host.querySelector(".dt-result");
  if (!el) return null;
  return el.classList.contains("dt-result--success") ? "success" : "failed";
}
function setrtle(ms) {
  for (let i = 0; i < 60; i++) h.flushFrames();
}
function arm() {
  const s = center(rectOf(host.querySelector(".dt__start")));
  moveTo(s.x, s.y);
  setrtle();
}

h.window.localStorage.clear();

console.log("=== Paramètres & initialisation ===");
assert(PLAYER_RADIUS === 8 && COLLISION_TOLERANCE === 2, "rayon & tolérance configurables");
assert(host.querySelector(".dt__label")?.textContent === "DON'T TOUCH", "écran READY affiché");
ok("param + READY OK");

console.log("=== Départ -> PLAYING ===");
play();
assert(host.querySelector(".dt__play") !== null, "zone montée");
assert(host.querySelectorAll(".dt__obs").length === 3, "3 obstacles (config prédéfinie)");
ok("PLAYING OK");

console.log("=== Conversion & position (centre) ===");
moveTo(160, 160);
setrtle();
const p0 = dotPos();
assert(p0 && near(p0.x, 160) && near(p0.y, 160),
  `point à ~(160,160) (réel: ${(p0?.x ?? NaN).toFixed(1)},${(p0?.y ?? NaN).toFixed(1)})`);
ok("conversion globale->locale OK");

console.log("=== Clamp : le point reste entièrement dans la zone ===");
moveTo(320, 168);
setrtle();
let e = dotPos();
assert(e && near(e.x, 320 - PLAYER_RADIUS) && near(e.y, 168), "clamp droite à width - r");
moveTo(4, 168);
setrtle();
let l = dotPos();
assert(l && near(l.x, PLAYER_RADIUS), `clamp gauche à r (réel x=${(l?.x ?? NaN).toFixed(1)})`);
moveTo(260, 340);
setrtle();
let b = dotPos();
assert(b && near(b.y, 340 - PLAYER_RADIUS), "clamp bas à height - r");
ok("clamp OK");

console.log("=== Fluidité : la position visuelle suit la logique ===");
moveTo(80, 80);
h.flushFrames();
let mid = dotPos();
assert(mid && !(near(mid.x, 80) && near(mid.y, 80)),
  `intermédiaire ≠ cible (réel: (${(mid?.x ?? NaN).toFixed(1)},${(mid?.y ?? NaN).toFixed(1)}))`);
setrtle();
let fin = dotPos();
assert(fin && near(fin.x, 80) && near(fin.y, 80), "converge vers la cible logique");
ok("interpolation + convergence OK");

console.log("=== Armement : pas de collision injuste avant le départ ===");
play();
const obs0 = pickOb();
moveTo(obs0.x + obs0.w / 2, obs0.y + obs0.h / 2); // traverse sans être armé
setrtle();
assert(resultKind() === null, "avant armement : pas de collision");
arm();
assert(host.querySelector(".dt__dot").classList.contains("dt--armed"), "contour d'armement visible");
assert(resultKind() === null, "dans le départ : pas de collision");
ok("armement OK");

console.log("=== Collision : feedback 💥 puis écran FAIL ===");
moveTo(obs0.x + obs0.w / 2, obs0.y + obs0.h / 2);
assert(host.querySelector(".dt__boom") !== null, "feedback 💥 avant l'écran");
assert(resultKind() === null, "pas encore l'écran final pendant le feedback");
h.flushTimers();
assert(resultKind() === "failed", "écran FAILED après le feedback");
ok("collision + feedback OK");

console.log("=== Collision cercle vs rectangle + tolérance ===");
play();
arm();
const obs1 = pickOb();
const eff = PLAYER_RADIUS - COLLISION_TOLERANCE; // 6
const cy = obs1.y + obs1.h / 2;
moveTo(obs1.x - eff - 0.5, cy); // juste dehors
h.flushTimers();
assert(resultKind() === null, "juste dehors : pas de collision");
moveTo(obs1.x - eff, cy); // bord effective (distance == tol)
h.flushTimers();
assert(resultKind() === null, "bord exact : toléré (marge)");
moveTo(obs1.x - eff + 0.5, cy); // légèrement à l'intérieur
h.flushTimers();
assert(resultKind() === "failed", "légèrement à l'intérieur : collision détectée");
ok("tolérance configurable OK");

console.log("=== Réussite : feedback ✨ puis succès + cleanup ===");
play();
arm();
const tg = center(rectOf(host.querySelector(".dt__target")));
moveTo(tg.x, tg.y);
assert(host.querySelector(".dt__boom") !== null, "feedback ✨ à la réussite");
h.flushTimers();
assert(resultKind() === "success", "écran SUCCESS");
assert(host.querySelector(".dt__dot") === null, "point retiré (plus d'animation)");
h.flushFrames();
assert(host.querySelector(".dt-result--success") !== null, "DOM stable après raf (boucle stoppée)");
assert(h.errors.length === 0, "0 erreur JS");
ok("succès + cleanup OK");

console.log("=== Réussite : aucune écriture avant d'avoir atteint la cible ===");
h.window.localStorage.clear();
play();
arm();
moveTo(160, 160);
h.flushFrames();
assert(dtStats().gamesPlayed === 0, "en jeu : rien n'est encore enregistré");
ok("pas d'enregistrement prématuré OK");

console.log("=== Échec : aucune statistique enregistrée ===");
play();
arm();
const obsF = pickOb();
moveTo(obsF.x + obsF.w / 2, obsF.y + obsF.h / 2);
h.flushTimers();
assert(resultKind() === "failed", "écran FAILED");
assert(dtStats().gamesPlayed === 0, "échec : gamesPlayed reste à 0");
assert(dtStats().bestScore === 0 && dtStats().bestTime === null, "échec : aucun record écrit");
ok("échec sans écriture OK");

console.log("=== Réussite : records persistés (score + temps + gamesPlayed) ===");
const secs1 = winRun(8000); // 8 s -> score = 200 + (40-8)*5 = 360
assert(resultKind() === "success", "écran SUCCESS");
assert(scoreForTime(secs1) === expectedScore(secs1), `scoreForTime(${secs1}) = ${expectedScore(secs1)}`);
const st1 = dtStats();
assert(st1.gamesPlayed === 1, "gamesPlayed = 1 après une réussite");
assert(st1.bestScore === expectedScore(secs1), `bestScore = ${expectedScore(secs1)}`);
assert(Math.abs(st1.bestTime - secs1) < 0.01, `bestTime = ${secs1}s`);
const freshStats = await h.reloadFresh("storage/stats.js");
const st1b = freshStats.getGameStats("don-touch");
assert(st1b.gamesPlayed === 1 && st1b.bestScore === st1.bestScore, "records persistés après rechargement");
ok("persistance des records Don't Touch OK");

console.log("=== Écran de succès : feedback « Nouveau record ! » + meilleur temps ===");
winRun(20000); // 20 s : moins bon temps, même socle+bonus différent
const resEl = host.querySelector(".dt-result--success");
assert(resEl !== null, "second succès rendu");
assert(host.querySelector(".os-record") === null, "pas de 'Nouveau record' si rien n'est battu");
assert(/Meilleur temps/.test(host.querySelector(".dt-result__record-time")?.textContent || ""),
  "ligne 'Meilleur temps' affichée (temps conservé)");
assert(dtStats().bestTime === secs1, "bestTime conservé (le plus petit gagne)");
winRun(1000); // 1 s : nouveau record de temps ET de score
assert(host.querySelector(".os-record") !== null, "'🏆 Nouveau record !' quand un record est battu");
assert(dtStats().bestTime === 1, "bestTime mis à jour vers le plus rapide");
assert(dtStats().gamesPlayed === 3, "gamesPlayed = 3 réussites");
ok("feedback records OK");

console.log("=== Scoring : bonus vitesse plafonné, socle garanti ===");
assert(scoreForTime(0) === SCORE_BASE + SCORE_FLOOR_S * SCORE_PER_S, "score max = socle + bonus complet");
assert(scoreForTime(60) === SCORE_BASE, "au-delà du plancher : socle seul");
assert(scoreForTime(-5) === scoreForTime(0), "jamais au-dessus du plafond logique");
ok("formule de score bornée OK");

console.log("=== Navigation : retour propre ===");
const dt2 = await h.reloadFresh("games/don-touch/dontTouch.js");
const host2 = document.createElement("div");
app.appendChild(host2);
dt2.game.mount(host2);
let backed = false;
host2.addEventListener("back", () => (backed = true), { once: true });
host2.querySelector('[data-action="back"]').click();
assert(backed, "action retour émet 'back'");
ok("nav OK");

if (h.errors.length) {
  fail++;
  console.log("  FAIL - erreurs JS:", h.errors);
} else {
  ok("0 erreur JavaScript");
}
console.log(`\nDon't Touch (refonte + records) : ${pass} assertions, ${fail} échecs`);
process.exitCode = fail ? 1 : 0;