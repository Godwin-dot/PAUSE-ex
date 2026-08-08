/* Tests automatisés — popup : rendu de l'accueil, navigation,
   statistiques, réinitialisation et persistance (UX, pas gameplay). */
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
const popup = await h.loadModule("popup/popup.js");

function text(sel) {
  const el = app.querySelector(sel);
  return el ? el.textContent.replace(/\s+/g, " ").trim() : null;
}
function count(sel) {
  return app.querySelectorAll(sel).length;
}
function goBack() {
  const btn = app.querySelector('[data-action="back"]');
  if (btn) btn.click();
}

h.window.localStorage.clear();

console.log("=== Accueil : en-tête PAUSE + carte(s) (registre) ===");
assert(text(".topbar__name") === "PAUSE", "en-tête : marque PAUSE affichée");
assert(count('.topbar [data-goto="stats"]') === 1, "bouton statistiques présent dans l'en-tête");
assert(count(".game-card") === 3, "3 cartes de jeu (une par jeu du registre)");
ok("accueil OK");

console.log("=== Cartes : emoji, titre, description, JOUER, état vide ===");
const first = app.querySelector(".game-card");
assert(first.querySelector(".game-card__title"), "carte : titre");
assert(first.querySelector(".game-card__desc"), "carte : description");
assert(first.querySelector(".game-card__emoji"), "carte : emoji");
const cta = first.querySelector(".game-card__cta");
assert(cta && /JOUER/.test(cta.textContent), "carte : bouton JOUER");
assert(count(".game-card__empty") === 3, "sans partie jouée : état vide 'Pas encore de record'");
assert(count(".game-card__perf") === 0, "sans partie jouée : pas de performance affichée");
ok("cartes OK");

console.log("=== JOUER tape le jeu du registre (One Second) puis retour ===");
app.querySelector('.game-card__cta[data-game="one-second"]').click();
assert(app.querySelector(".os__target") !== null, "One Second monté");
app.dispatchEvent(new h.window.CustomEvent("back"));
assert(app.querySelector(".home") !== null, "retour à l'accueil");
ok("navigation vers un jeu + retour OK");

console.log("=== JOUER tape le jeu du registre (Clean It) puis retour ===");
app.querySelector('.game-card__cta[data-game="clean-it"]').click();
assert(app.querySelector(".ci__btn[data-action='start']") !== null, "Clean It monté");
app.dispatchEvent(new h.window.CustomEvent("back"));
assert(app.querySelector(".home") !== null, "retour à l'accueil");
ok("navigation Clean It + retour OK");

console.log("=== Statistiques : blocs par jeu + états vides + retour ===");
app.querySelector('.topbar [data-goto="stats"]').click();
assert(app.querySelector(".page-head__title") !== null, "vue Statistiques affichée");
assert(count(".stats__game") === 3, "un bloc par jeu du registre");
assert(count(".stats__empty") === 3, "3 blocs vides (aucune partie jouée)");
assert(app.querySelector('.stats__reset[data-action="reset"]') !== null, "bouton RÉINITIALISER conservé");
goBack();
assert(app.querySelector(".home") !== null, "retour accueil depuis les stats");
ok("Statistiques + retour OK");

console.log("=== Persistance : records lus sur les cartes ===");
statsNs.recordGameResult("one-second", { score: 10, bestAccuracy: 0.2, bestCombo: 3 });
statsNs.recordGameResult("clean-it", { score: 42, bestTime: 1.5, bestCombo: 5 });
const popup2 = await h.reloadFresh("popup/popup.js");
assert(count(".game-card__empty") === 1, "1 état vide restant (Don't Touch, sans stats)");
const osPerf = text('.game-card[data-game="one-second"] .game-card__perf');
assert(osPerf && /10 pts/.test(osPerf), "One Second : meilleur score affiché sur la carte");
const ciPerf = text('.game-card[data-game="clean-it"] .game-card__perf');
assert(ciPerf && /42 pts/.test(ciPerf), "Clean It : meilleur score affiché sur la carte");
ok("records persistés et reflétés sur l'accueil");

console.log("=== Statistiques avec records : métriques différenciées ===");
app.querySelector('.topbar [data-goto="stats"]').click();
const labels = [...app.querySelectorAll(".stats__game .stat__label")].map((n) => n.textContent);
assert(labels.some((l) => l === "Meilleur temps"), "Clean It : métrique 'Meilleur temps'");
assert(labels.some((l) => l === "Meilleure précision"), "One Second : métrique 'Meilleure précision'");
assert(count(".stats__empty") === 1, "1 bloc vide restant (Don't Touch, sans stats)");
goBack();

console.log("=== Réinitialisation : confirmation, annuler puis confirmer ===");
app.querySelector('.topbar [data-goto="stats"]').click();
app.querySelector('.stats__reset[data-action="reset"]').click();
assert(app.querySelector(".stats-confirm") !== null, "écran de confirmation affiché");
app.querySelector('.stats-confirm [data-action="cancel"]').click();
assert(app.querySelector(".stats__game") !== null, "annuler -> on reste sur les stats");
assert(statsNs.getGameStats("one-second").gamesPlayed === 1, "annuler ne détruit rien");
app.querySelector('.stats__reset[data-action="reset"]').click();
app.querySelector('.stats-confirm [data-action="confirm"]').click();
assert(statsNs.getGameStats("one-second").gamesPlayed === 0, "confirmer efface les stats");
assert(count(".stats__empty") === 3, "après reset : états vides de retour");
ok("réinitialisation OK");

if (h.errors.length) {
  fail++;
  console.log("  FAIL - erreurs JS:", h.errors);
} else {
  ok("0 erreur JavaScript");
}
console.log(`\nPopup : ${pass} assertions, ${fail} échecs`);
process.exitCode = fail ? 1 : 0;