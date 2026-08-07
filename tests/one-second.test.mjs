/* Tests automatisés — One Second : régression statistiques (aucun impact étape 6). */
import { createHarness } from "./harness.mjs";

const h = createHarness();
const { document, app } = h;

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

const statsNs = await h.loadModule("storage/stats.js");
const osNs = await h.loadModule("games/one-second/oneSecond.js");

function mountIt() {
  const host = document.createElement("div");
  app.appendChild(host);
  osNs.game.mount(host);
  return host;
}
function text(host, sel) {
  const el = host.querySelector(sel);
  return el ? el.textContent.replace(/\s+/g, " ").trim() : null;
}

h.window.localStorage.clear();

console.log("=== One Second : régression des stats ===");
const host = mountIt();
assert(text(host, ".os__target") !== null, "écran READY");

const ROUNDS = 5;
for (let r = 0; r < ROUNDS; r++) {
  const target = parseFloat(text(host, ".os__target"));
  assert(target > 0 && target <= 10, `cible lisible (${target})`);
  host.querySelector('[data-action="start"]').click();
  h.advance(target * 1000);
  host.querySelector('[data-action="stop"]').click();
  const level = text(host, ".os-result__level");
  assert(level && level.includes("PERFECT"), `manche ${r + 1}: ${level || "?"}`);
  host.querySelector('[data-action="next"]').click();
}

assert(text(host, ".os-end__title")?.includes("Session"), "écran final");
const stats = statsNs.getGameStats("one-second");
assert(stats.gamesPlayed === 1, "gamesPlayed incrémenté (1)");
assert(stats.bestScore > 0, "bestScore enregistré (>0)");
assert(stats.bestAccuracy !== null && stats.bestAccuracy <= 0.05, "bestAccuracy = meilleure précision (<=0.05s)");
assert(stats.bestCombo === ROUNDS, `bestCombo = ${ROUNDS}`);
assert(stats.bestTime === null, "bestTime reste null (champ nouveau, non utilisé par One Second)");
assert(text(host, ".os-record")?.includes("Nouveau record"), "bannière 🏆 Nouveau record (1re session)");
ok("session complète enregistrée, bestTime intact (non-régressif)");

// persistance après fermeture/réouverture
const fresh = await h.reloadFresh("storage/stats.js");
const again = fresh.getGameStats("one-second");
assert(
  again.bestScore === stats.bestScore && again.bestAccuracy === stats.bestAccuracy && again.bestTime === null,
  "records One Second persistés après réouverture"
);
ok("persistance One Second OK");

// REJOUER : ne réinitialise pas les records
host.querySelector('[data-action="replay"]').click();
assert(text(host, ".os__target") !== null, "REJOUER -> READY");
const after = statsNs.getGameStats("one-second");
assert(after.gamesPlayed === 1, "gamesPlayed inchangé après REJOUER");
assert(after.bestScore === stats.bestScore, "bestScore conservé après REJOUER");
ok("REJOUER One Second : partie reset, records conservés");

// 2e session complète -> gamesPlayed=2, records max conservés
const host2 = mountIt();
for (let r = 0; r < ROUNDS; r++) {
  const target = parseFloat(text(host2, ".os__target"));
  host2.querySelector('[data-action="start"]').click();
  h.advance(target * 1000);
  host2.querySelector('[data-action="stop"]').click();
  host2.querySelector('[data-action="next"]').click();
}
const s2 = statsNs.getGameStats("one-second");
assert(s2.gamesPlayed === 2, "2e session comptée (gamesPlayed=2)");
assert(s2.bestScore === stats.bestScore, "bestScore = max des 2 sessions");
assert(s2.bestCombo === ROUNDS, "bestCombo = max");
assert(s2.bestTime === null, "bestTime toujours null");
ok("2 sessions : records max conservés, gamesPlayed=2");

if (h.errors.length) {
  fail++;
  console.log("  FAIL - erreurs JS:", h.errors);
} else {
  ok("0 erreur JavaScript");
}
console.log(`\nOne Second : ${pass} assertions, ${fail} échecs`);
process.exitCode = fail ? 1 : 0;