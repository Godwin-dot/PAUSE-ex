/* =========================================================
   PAUSE — Point d'entrée du popup
   ---------------------------------------------------------
   Mini-routeur : bascule entre trois vues :
     - Accueil       (en-tête PAUSE + cartes de jeu + stats)
     - Mini-jeu      (délègue à game.mount(container))
     - Statistiques  (records locaux + réinitialisation)

   La navigation repose sur l'événement "back" émis par la
   vue courante ; chaque vue enregistre un écouteur one-shot
   qui ramène à l'accueil. Le rendu est piloté par le registre
   GAMES : ajouter un jeu = une carte et un bloc stats offerts.
   ========================================================= */

import { GAMES } from "../games/games.js";
import { getGameStats, resetAll } from "../storage/stats.js";
import { escapeHtml, formatSeconds } from "../games/shared/ui.js";

const app = document.querySelector("#app");

/** Durée lisible ou tiret long si absente. */
function fmtDuration(value) {
  return value === null || value === undefined ? "—" : formatSeconds(value);
}

function comboLabel(value) {
  return value > 0 ? `x${value}` : "—";
}

/**
 * Champ "durée" effectivement utilisé par un jeu :
 *   - "time"     -> Clean It (bestTime)
 *   - "accuracy" -> One Second (bestAccuracy)
 *   - null       -> aucun record de durée pour l'instant
 * Déduit des données (et non de l'id), donc générique pour tout
 * futur jeu du registre.
 */
function durationField(stats) {
  if (stats.bestTime != null) return "time";
  if (stats.bestAccuracy != null) return "accuracy";
  return null;
}

/** Lignes de statistiques propres à chaque jeu, selon ses champs. */
function gameMetrics(stats) {
  const duration = durationField(stats);
  const durationLabel =
    duration === "time"
      ? "Meilleur temps"
      : duration === "accuracy"
        ? "Meilleure précision"
        : "Temps record";
  const durationValue =
    duration === "time"
      ? fmtDuration(stats.bestTime)
      : duration === "accuracy"
        ? fmtDuration(stats.bestAccuracy)
        : "—";
  return [
    ["Meilleur score", stats.bestScore],
    [durationLabel, durationValue],
    ["Meilleur combo", comboLabel(stats.bestCombo)],
    ["Parties jouées", stats.gamesPlayed],
  ];
}

/** Meilleure performance d'un jeu, affichée sur sa carte d'accueil. */
function bestPerf(game, stats) {
  const head = `${stats.bestScore} pts`;
  const duration = durationField(stats);
  const extra =
    duration === "time"
      ? `⚡ ${fmtDuration(stats.bestTime)}`
      : duration === "accuracy"
        ? `🎯 ${fmtDuration(stats.bestAccuracy)}`
        : "";
  return `<span class="perf__val">${[head, extra].filter(Boolean).join(" · ")}</span>`;
}

function goHome() {
  renderHome();
}

/** Enregistre la navigation de retour puis rend la vue fournie. */
function enterView(render) {
  app.addEventListener("back", goHome, { once: true });
  render();
}

/* ---------- Accueil ---------- */

function cardHtml(game) {
  const stats = getGameStats(game.id);
  const played = stats.gamesPlayed > 0;
  return `
    <article class="game-card" data-game="${escapeHtml(game.id)}">
      <div class="game-card__head">
        <span class="game-card__emoji" aria-hidden="true">${escapeHtml(game.emoji)}</span>
        <div class="game-card__info">
          <h3 class="game-card__title">${escapeHtml(game.title)}</h3>
          <p class="game-card__desc">${escapeHtml(game.description)}</p>
        </div>
      </div>
      ${
        played
          ? `<span class="game-card__perf">🏆 ${bestPerf(game, stats)}</span>`
          : '<span class="game-card__empty">Pas encore de record — lance une partie !</span>'
      }
      <button class="btn btn--primary game-card__cta" data-game="${escapeHtml(game.id)}">JOUER</button>
    </article>
  `;
}

function renderHome() {
  app.innerHTML = `
    <section class="home fade-in">
      <header class="topbar">
        <div class="topbar__brand">
          <span class="topbar__logo" aria-hidden="true">🌿</span>
          <span class="topbar__name">PAUSE</span>
        </div>
        <button class="btn btn--ghost topbar__stats" data-goto="stats" aria-label="Ouvrir les statistiques">📊</button>
      </header>

      <p class="intro">Prends une <strong>petite pause</strong>.</p>

      <h2 class="games-title">Mini-jeux</h2>
      <div class="game-list">
        ${GAMES.map(cardHtml).join("")}
      </div>

      <footer class="home__foot">Fais une pause de quelques secondes.</footer>
    </section>
  `;

  app.querySelectorAll(".game-card__cta").forEach((button) => {
    button.addEventListener("click", () => {
      const game = GAMES.find((g) => g.id === button.dataset.game);
      if (game) renderGame(game);
    });
  });

  app.querySelectorAll('[data-goto="stats"]').forEach((button) => {
    button.addEventListener("click", () => enterView(renderStats));
  });
}

/* ---------- Mini-jeu ---------- */

function renderGame(game) {
  enterView(() => game.mount(app));
}

/* ---------- Statistiques ---------- */

function statsBlock(game) {
  const stats = getGameStats(game.id);
  const rows = gameMetrics(stats)
    .map(
      ([label, value]) => `
        <div class="stat">
          <span class="stat__label">${label}</span>
          <span class="stat__value">${value}</span>
        </div>`
    )
    .join("");
  const empty =
    stats.gamesPlayed === 0
      ? '<p class="stats__empty">Pas encore de statistiques.</p>'
      : "";
  return `
    <article class="stats__game">
      <h3 class="stats__game-title"><span aria-hidden="true">${escapeHtml(game.emoji)}</span> ${escapeHtml(game.title)}</h3>
      <div class="stats__grid">${rows}${empty}</div>
    </article>
  `;
}

function renderStats() {
  app.innerHTML = `
    <section class="view fade-in">
      <header class="page-head">
        <button class="btn btn--ghost btn--back" data-action="back" aria-label="Retour">←</button>
        <h2 class="page-head__title">📊 Statistiques</h2>
      </header>
      <div class="stats">
        ${GAMES.map(statsBlock).join("")}
      </div>
      <button class="btn btn--danger stats__reset" data-action="reset">RÉINITIALISER</button>
    </section>
  `;

  app
    .querySelector('[data-action="back"]')
    .addEventListener("click", () => app.dispatchEvent(new CustomEvent("back")));

  app
    .querySelector('[data-action="reset"]')
    .addEventListener("click", () => renderStatsConfirm());
}

function renderStatsConfirm() {
  app.innerHTML = `
    <section class="view fade-in">
      <header class="page-head">
        <button class="btn btn--ghost btn--back" data-action="cancel" aria-label="Retour">←</button>
        <h2 class="page-head__title">📊 Statistiques</h2>
      </header>
      <div class="stats-confirm">
        <p class="stats-confirm__title">Réinitialiser toutes les statistiques ?</p>
        <p class="stats-confirm__hint">Cette action est définitive.</p>
        <div class="stats-confirm__actions">
          <button class="btn btn--ghost" data-action="cancel">ANNULER</button>
          <button class="btn btn--primary" data-action="confirm">RÉINITIALISER</button>
        </div>
      </div>
    </section>
  `;

  app.querySelectorAll('[data-action="cancel"]').forEach((button) => {
    button.addEventListener("click", () => renderStats());
  });

  app.querySelector('[data-action="confirm"]').addEventListener("click", () => {
    resetAll();
    renderStats();
  });
}

/* ---------- Démarrage ---------- */

renderHome();
