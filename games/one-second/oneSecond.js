/* =========================================================
   PAUSE — One Second
   ---------------------------------------------------------
   Mini-jeu de perception du temps : arrêter le chronomètre
   le plus près possible de la durée cible.

   Déroulement (machine à états simple) :
     ready   -> affiche la cible, bouton DÉMARRER
     playing -> chrono en cours (performance.now), ARRÊTER
     result  -> niveau, temps, différence, points, combo
     end     -> score final, précisions, meilleur combo

   La mesure du temps repose UNIQUEMENT sur des timestamps
   (performance.now). requestAnimationFrame sert uniquement
   à rafraîchir l'affichage du chrono.

   Améliorations étape 3 :
     - combo (série de manches >= GOOD) et son feedback ;
     - multiplicateur de score plafonné ;
     - difficulté progressive, sans rendre la cible injuste ;
     - zone de précision visuelle sur l'écran de résultat ;
     - meilleure précision / meilleur combo de session ;
     - écran final enrichi (REJOUER + ACCUEIL).

   Étape 4 :
     - enregistrement des records dans les statistiques locales ;
     - feedback « Nouveau record ! » en fin de session.
   ========================================================= */

import { recordGameResult } from "../../storage/stats.js";
import { formatSeconds, clamp, bindActions } from "../shared/ui.js";
import {
  OS_ROUNDS_PER_SESSION as ROUNDS_PER_SESSION,
  OS_COMBO_BONUS_STEP as COMBO_BONUS_STEP,
  OS_COMBO_BONUS_MAX as COMBO_BONUS_MAX,
} from "../balance.js";

const GAUGE_WINDOW = 0.5; // fenêtre affichée autour de la cible (secondes)

const LEVELS = [
  { key: "perfect", label: "PERFECT!", emoji: "✨", maxDiff: 0.05, points: 100 },
  { key: "excellent", label: "EXCELLENT!", emoji: "", maxDiff: 0.15, points: 80 },
  { key: "good", label: "GOOD!", emoji: "", maxDiff: 0.3, points: 60 },
  { key: "close", label: "CLOSE", emoji: "", maxDiff: 0.6, points: 40 },
];

const MISS = { key: "miss", label: "MISS", emoji: "", maxDiff: Infinity, points: 10 };

const STREAK_KEYS = ["perfect", "excellent", "good"];

/** Pools de cibles par manche (1-basée -> index 0 à 4). Subtilement progressifs. */
const DIFFICULTY = [
  [3, 5, 7, 10],
  [3, 5, 7, 10],
  [3, 3, 5, 5, 7, 10], // manche 3 : plus de cibles courtes
  [3, 3, 5, 5, 7, 10], // manche 4 : plus de cibles courtes
  [3, 5, 7, 10, 10, 10], // manche 5 : chance de cible longue (plus exigeante)
];

/** Niveau atteint selon la différence absolue. */
function evaluate(diff) {
  return LEVELS.find((level) => diff <= level.maxDiff) ?? MISS;
}

/** Cible pondérée selon la manche, sans répéter immédiatement la précédente. */
function pickTarget(roundIndex, previous) {
  const pool = DIFFICULTY[roundIndex] ?? DIFFICULTY[0];
  let candidates = pool.filter((target) => target !== previous);
  if (!candidates.length) candidates = pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export const game = {
  id: "one-second",
  emoji: "🧠",
  title: "One Second",
  description: "Trouve la bonne durée. Pas plus.",

  /**
   * Monte le jeu dans le conteneur racine.
   * Chaque appel crée une session neuve et rend l'écran READY.
   * @param {HTMLElement} container
   */
  mount(container) {
    if (container.__osUnbind) container.__osUnbind();

    const state = {
      phase: "ready",
      target: pickTarget(0),
      round: 0,
      score: 0,
      combo: 0,
      bestCombo: 0,
      bestPrecision: null,
      results: [],
      rafId: null,
      startTime: 0,
      finalized: false,
      sessionSummary: null,
    };

    /* ---------- Actions ---------- */

    function start() {
      state.startTime = performance.now();
      state.phase = "playing";
      renderPlaying();
      tick();
    }

    function stop() {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
      const elapsed = (performance.now() - state.startTime) / 1000;
      const diff = Math.abs(elapsed - state.target);
      const level = evaluate(diff);

      const prevCombo = state.combo;
      const isStreak = STREAK_KEYS.includes(level.key);
      state.combo = isStreak ? state.combo + 1 : 0;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      const bonus = Math.max(
        0,
        Math.min((state.combo - 1) * COMBO_BONUS_STEP, COMBO_BONUS_MAX)
      );
      const points = level.points + bonus;
      state.score += points;

      if (state.bestPrecision === null || diff < state.bestPrecision) {
        state.bestPrecision = diff;
      }
      state.results.push({ diff, elapsed });
      state.round += 1;
      state.phase = "result";

      renderResult({
        elapsed,
        diff,
        level,
        points,
        bonus,
        comboBroken: !isStreak && prevCombo >= 2,
      });
    }

    function next() {
      if (state.round >= ROUNDS_PER_SESSION) {
        finalizeSession();
        state.phase = "end";
        renderEnd();
        return;
      }
      state.target = pickTarget(state.round, state.target);
      state.phase = "ready";
      renderReady();
    }

    /** Enregistre les records une seule fois, à la fin de la session. */
    function finalizeSession() {
      if (state.finalized) return;
      state.finalized = true;
      state.sessionSummary = recordGameResult(game.id, {
        score: state.score,
        bestAccuracy: state.bestPrecision,
        bestCombo: state.bestCombo,
      });
    }

    function restart() {
      state.round = 0;
      state.score = 0;
      state.combo = 0;
      state.bestCombo = 0;
      state.bestPrecision = null;
      state.results.length = 0;
      state.target = pickTarget(0);
      state.phase = "ready";
      state.finalized = false;
      state.sessionSummary = null;
      renderReady();
    }

    function back() {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
      container.dispatchEvent(new CustomEvent("back"));
    }

    /* ---------- Rafraîchissement visuel du chrono ---------- */

    function tick() {
      if (state.phase !== "playing") return;
      const elapsed = (performance.now() - state.startTime) / 1000;
      const timerEl = container.querySelector(".os__timer");
      if (timerEl) timerEl.textContent = formatSeconds(elapsed);
      state.rafId = requestAnimationFrame(tick);
    }

    /* ---------- Rendu ---------- */

    function head() {
      return `
        <div class="game-view__head">
          <button class="btn btn--ghost" data-action="back" aria-label="Retour">←</button>
          <span class="game-view__name">${game.emoji} ${game.title}</span>
        </div>
      `;
    }

    function bestLabel() {
      return state.bestPrecision === null ? "—" : formatSeconds(state.bestPrecision);
    }

    function meta() {
      const round = Math.min(state.round + 1, ROUNDS_PER_SESSION);
      return `
        <div class="os__meta">
          <span>SCORE ${state.score}</span>
          <span><b>MEILL</b> ${bestLabel()}</span>
          <span>MANCHE ${round}/${ROUNDS_PER_SESSION}</span>
        </div>
      `;
    }

    function renderReady() {
      container.innerHTML = `
        <div class="game-view fade-in">
          ${head()}
          <div class="os">
            <p class="os__label">Objectif</p>
            <p class="os__target">${formatSeconds(state.target)}</p>
            <p class="os__hint">Estime le moment exact…</p>
            <button class="btn btn--primary os__btn" data-action="start">DÉMARRER</button>
            ${meta()}
          </div>
        </div>
      `;
    }

    function renderPlaying() {
      container.innerHTML = `
        <div class="game-view fade-in">
          ${head()}
          <div class="os">
            <p class="os__label">Objectif ${formatSeconds(state.target)}</p>
            <p class="os__timer">0.00 s</p>
            <button class="btn btn--primary os__btn" data-action="stop">ARRÊTER</button>
            ${meta()}
          </div>
        </div>
      `;
    }

    function renderResult({ elapsed, diff, level, points, bonus, comboBroken }) {
      const ratio = clamp((elapsed - state.target) / GAUGE_WINDOW, -1, 1);
      const markerLeft = clamp(50 + ratio * 50, 3, 97);
      const direction = elapsed < state.target - 0.001 ? "Trop tôt" : "Trop tard";

      let comboHtml = "";
      if (comboBroken) {
        comboHtml = `<p class="os-combo os-combo--lost">Combo perdu</p>`;
      } else if (state.combo >= 2) {
        comboHtml = `<p class="os-combo">🔥 Combo x${state.combo}</p>`;
      }

      container.innerHTML = `
        <div class="game-view fade-in">
          ${head()}
          <div class="os-result os-result--${level.key}">
            <p class="os-result__level">${level.label} ${level.emoji}</p>
            <p class="os-result__elapsed">${formatSeconds(elapsed)}</p>
            <p class="os-result__diff">
              Différence : ${formatSeconds(diff)} · ${direction}
            </p>

            <div class="os-gauge" aria-hidden="true">
              <span class="os-gauge__center"></span>
              <span class="os-gauge__marker" style="left:${markerLeft}%"></span>
            </div>
            <div class="os-gauge__labels">
              <span>${formatSeconds(state.target - GAUGE_WINDOW)}</span>
              <span>${formatSeconds(state.target)}</span>
              <span>${formatSeconds(state.target + GAUGE_WINDOW)}</span>
            </div>

            <p class="os-result__points">
              +${points}${bonus > 0 ? ` <em>+${bonus} combo</em>` : ""}
            </p>
            ${comboHtml}

            <button class="btn btn--primary os__btn" data-action="next">CONTINUER</button>
          </div>
          ${meta()}
        </div>
      `;
    }

    function renderEnd() {
      const avg =
        state.results.length &&
        state.results.reduce((sum, result) => sum + result.diff, 0) /
          state.results.length;
      const best = state.bestPrecision === null ? "—" : formatSeconds(state.bestPrecision);
      const bestCombo = state.bestCombo > 0 ? `x${state.bestCombo}` : "—";
      const record =
        state.sessionSummary?.newScoreRecord
          ? `<p class="os-record">🏆 Nouveau record !</p>`
          : "";
      container.innerHTML = `
        <div class="game-view fade-in">
          ${head()}
          <div class="os-end">
            <p class="os-end__title">✨ Session terminée</p>
            ${record}
            <p class="os-end__score">${state.score}</p>
            <p class="os-end__score-label">points</p>

            <div class="os-end__stats">
              <div class="os-end__stat"><span>Meilleure précision</span><b>${best}</b></div>
              <div class="os-end__stat"><span>Précision moyenne</span><b>${formatSeconds(avg)}</b></div>
              <div class="os-end__stat"><span>Meilleur combo</span><b>${bestCombo}</b></div>
            </div>

            <div class="os-end__actions">
              <button class="btn btn--primary os__btn" data-action="replay">REJOUER</button>
              <button class="btn btn--ghost os__btn" data-action="home">ACCUEIL</button>
            </div>
          </div>
        </div>
      `;
    }

    /* ---------- Liaison des actions (délégation partagée) ---------- */

    const unbindActions = bindActions(container, (action) => {
      if (action === "back" || action === "home") return back();
      if (action === "start") return start();
      if (action === "stop") return stop();
      if (action === "next") return next();
      if (action === "replay") return restart();
    });

    container.__osUnbind = () => {
      cancelAnimationFrame(state.rafId);
      unbindActions();
      delete container.__osUnbind;
    };

    renderReady();
  },
};