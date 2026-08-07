/* Tests unitaires — storage/stats.js (bestTime, records, robustesse). */
import { createHarness } from "./harness.mjs";

const h = createHarness();
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

const s = await h.loadModule("storage/stats.js");

h.window.localStorage.clear();

console.log("=== recordGameResult : bestScore/bestTime/bestCombo (max/min) ===");
let r = s.recordGameResult("x", { score: 100, bestTime: 5, bestCombo: 2 });
assert(r.newScoreRecord && r.newTimeRecord && r.newComboRecord && r.newRecord, "1re session : tous les records sont nouveaux");
assert(r.gamesPlayed === 1, "gamesPlayed=1");
assert(r.bestTime === 5, "bestTime=5");

r = s.recordGameResult("x", { score: 50, bestTime: 7, bestCombo: 1 });
assert(r.bestTime === 5, "bestTime conserve le MIN (5 vs 7)");
assert(r.bestScore === 100, "bestScore conserve le MAX");
assert(r.bestCombo === 2, "bestCombo conserve le MAX");
assert(!r.newScoreRecord && !r.newTimeRecord && !r.newComboRecord && !r.newRecord, "aucun nouveau record si performances inférieures");
assert(r.gamesPlayed === 2, "gamesPlayed=2");

r = s.recordGameResult("x", { score: 200, bestTime: 3, bestCombo: 5 });
assert(r.bestScore === 200 && r.bestTime === 3 && r.bestCombo === 5, "tous les records mis à jour");
assert(r.newRecord === true, "newRecord = true");

console.log("=== bestTime seul suffit pour un 'nouveau record' ===");
const r2 = s.recordGameResult("y", { score: 0, bestTime: 9 });
assert(r2.newTimeRecord && r2.newRecord && !r2.newScoreRecord, "record basé sur le temps seul");

console.log("=== Compat One Second (bestAccuracy, bestTime reste null) ===");
const os = s.recordGameResult("one-second", { score: 10, bestAccuracy: 0.2, bestCombo: 3 });
assert(os.bestAccuracy === 0.2, "bestAccuracy min conservé");
assert(os.bestTime === null, "bestTime null lorsque non fourni (non-régressif)");
// ma mise à jour : bestAccuracy min (plus grand -> ignore)
const os2 = s.recordGameResult("one-second", { score: 10, bestAccuracy: 0.5, bestCombo: 2 });
assert(os2.bestAccuracy === 0.2, "bestAccuracy = min(0.2, 0.5)");

console.log("=== Robustesse (données corrompues / invalides) ===");
h.window.localStorage.setItem("pause:stats", "{pas du json");
const corrupt = s.getGameStats("corrupt");
assert(corrupt.bestScore === 0 && corrupt.bestTime === null && corrupt.bestCombo === 0 && corrupt.gamesPlayed === 0, "repli propre sur JSON invalide");

h.window.localStorage.setItem(
  "pause:stats",
  JSON.stringify({ version: 1, games: { z: { bestScore: -5, bestTime: "abc", bestCombo: 99, gamesPlayed: "x" } } })
);
const z = s.getGameStats("z");
assert(z.bestScore === 0, "bestScore négatif ignoré -> 0");
assert(z.bestTime === null, "bestTime non-numérique ignoré -> null");
assert(z.bestCombo === 99, "bestCombo valide conservé");
assert(z.gamesPlayed === 0, "gamesPlayed invalide ignoré -> 0");
ok("sanitisation des métriques OK");

console.log("=== resetAll ===");
s.resetAll();
const cleared = s.getGameStats("x");
assert(cleared.gamesPlayed === 0 && cleared.bestScore === 0 && cleared.bestTime === null, "resetAll efface tout");

if (h.errors.length) {
  fail++;
  console.log("  FAIL - erreurs JS:", h.errors);
} else {
  ok("0 erreur JavaScript");
}
console.log(`\nStats : ${pass} assertions, ${fail} échecs`);
process.exitCode = fail ? 1 : 0;