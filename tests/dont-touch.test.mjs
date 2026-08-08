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

const mod = await h.loadModule("games/don-touch/dontTouch.js");
const { game, PLAYER_RADIUS, COLLISION_TOLERANCE } = mod;

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
console.log(`\nDon't Touch (refonte) : ${pass} assertions, ${fail} échecs`);
process.exitCode = fail ? 1 : 0;