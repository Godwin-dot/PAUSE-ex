/* =========================================================
   PAUSE — Clean It
   ---------------------------------------------------------
   Mini-jeu de nettoyage à la souris : l'écran est couvert de
   particules qu'on fait disparaître en déplaçant le curseur.

   Machine à états :
     ready    -> « Nettoie tout. », bouton COMMENCER
     playing  -> zone de jeu, particules, chrono, combo, score
     finished -> temps + score + records, REJOUER / ACCUEIL

   Contrôle : uniquement en déplaçant le curseur (pointermove).
   Timing   : basé sur performance.now() (indépendant des images).

   Étape 6 :
     - 3 types de particules (normal / petite / grande) ;
     - combo de nettoyage rapide (fenêtre ajustable) ;
     - feedback visuel de nettoyage + micro-feedbacks (+10, 🔥 xN) ;
     - score = particules + bonification combo + bonification temps ;
     - difficulté progressive (nombre de particules plafonné) ;
     - records persistants (bestScore / bestTime / bestCombo) ;
     - feedback unique « 🏆 Nouveau record ! ».
   ========================================================= */

import { getGameStats, recordGameResult } from "../../storage/stats.js";
import { formatSeconds, bindActions } from "../shared/ui.js";

/* --- Constantes ajustables --- */
const BASE_PARTICLE_COUNT = 30;
const MAX_PARTICLE_COUNT = 45;
const PARTICLES_PER_GAME = 2; // +2 particules à chaque partie jouée
const EDGE_MARGIN = 18; // garde la particule hors des bords de la zone
const MIN_GAP = 40; // distance minimale entre deux particules
const COMBO_WINDOW_MS = 500; // délai max entre deux nettoyages pour combo
const COMBO_BONUS_PER_STEP = 15; // bonus par marche de combo
const TIME_BONUS_FLOOR_SECONDS = 50; // au-delà, plus de bonus de temps
const TIME_BONUS_PER_SECOND = 10; // points par seconde gagnée (plafonné ci-dessous)
const TIME_BONUS_MAX = 250; // plafond : le bonus vitesse ne domine plus le score
const MAX_FLOATERS = 8; // max de micro-feedbacks simultanés

/* Trois types de particules : différences surtout visuelles. */
const TYPES = {
  normal: { value: 10, rMin: 7, rMax: 13, weight: 60, cls: "" },
  petite: { value: 15, rMin: 5, rMax: 8, weight: 25, cls: "ci__dot--petite" },
  grande: { value: 5, rMin: 14, rMax: 18, weight: 15, cls: "ci__dot--grande" },
};

function rand(min, max) {
  return min + Math.random() * (max - min);
}

/** Choix d'un type pondéré. */
function pickType() {
  const total = Object.values(TYPES).reduce((sum, t) => sum + t.weight, 0);
  let roll = Math.random() * total;
  for (const key of Object.keys(TYPES)) {
    roll -= TYPES[key].weight;
    if (roll <= 0) return key;
  }
  return "normal";
}

function typeInfo(key) {
  return TYPES[key] || TYPES.normal;
}

/**
 * Génère `count` particules éloignées les unes des autres, dans la zone.
 * Chaque particule reçoit un type (valeur + taille + classe CSS).
 * Grille spatiale de côté MIN_GAP : le test de proximité est O(1) par
 * candidate (4 cellules voisines) au lieu d'un parcours complet O(n).
 */
function spawnParticles(width, height, count) {
  const particles = [];
  const grid = new Map(); // "col,ligne" -> index des particules de la cellule
  const cellAt = (cx, cy) => `${cx},${cy}`;
  let attempts = 0;
  while (particles.length < count && attempts < count * 60) {
    attempts += 1;
    const x = rand(EDGE_MARGIN, width - EDGE_MARGIN);
    const y = rand(EDGE_MARGIN, height - EDGE_MARGIN);
    const cx = Math.floor(x / MIN_GAP);
    const cy = Math.floor(y / MIN_GAP);
    let tooClose = false;
    for (let ox = -1; ox <= 1 && !tooClose; ox += 1) {
      for (let oy = -1; oy <= 1 && !tooClose; oy += 1) {
        const bucket = grid.get(cellAt(cx + ox, cy + oy));
        if (!bucket) continue;
        for (const i of bucket) {
          const p = particles[i];
          if (Math.hypot(p.x - x, p.y - y) < MIN_GAP) {
            tooClose = true;
            break;
          }
        }
      }
    }
    if (tooClose) continue;
    const key = pickType();
    const info = typeInfo(key);
    const r = rand(info.rMin, info.rMax);
    const cell = cellAt(cx, cy);
    if (!grid.has(cell)) grid.set(cell, []);
    grid.get(cell).push(particles.length);
    particles.push({
      x, y, r, value: info.value, cls: info.cls, key,
      active: true, hitR: r + 8, el: null,
    });
  }
  return particles;
}

/** Nombre de particules pour la prochaine partie (difficulté progressive). */
function particleCountFor(gameId) {
  const played = getGameStats(gameId).gamesPlayed;
  return Math.min(MAX_PARTICLE_COUNT, BASE_PARTICLE_COUNT + played * PARTICLES_PER_GAME);
}

export const game = {
  id: "clean-it",
  emoji: "🧹",
  title: "Clean It",
  description: "Nettoie tout en bougeant la souris.",

  mount(container) {
    if (container.__ciUnbind) container.__ciUnbind();

    const state = {
      phase: "ready",
      particles: [],
      remaining: 0,
      particleCount: BASE_PARTICLE_COUNT,
      startTime: 0,
      rafId: null,
      zone: null,
      zoneRect: null,
      cleanTimers: [],
      floaters: [],
      onPointer: null,
      lastCleanTime: null,
      combo: 0,
      bestCombo: 0,
      scoreBase: 0,
      comboBonus: 0,
      score: 0,
      finalized: false,
      sessionSummary: null,
    };

    /* ---------- Actions ---------- */

    function startGame() {
      cleanup();
      state.phase = "playing";
      state.particleCount = particleCountFor(game.id);
      state.remaining = state.particleCount;
      state.lastCleanTime = null;
      state.combo = 0;
      state.bestCombo = 0;
      state.scoreBase = 0;
      state.comboBonus = 0;
      state.score = 0;
      state.finalized = false;
      state.sessionSummary = null;
      state.startTime = performance.now();
      renderPlaying();
      setupZone();
    }

    function back() {
      cleanup();
      container.dispatchEvent(new CustomEvent("back"));
    }

    /** Libère toutes les ressources (timers, RAF, listeners, DOM temporaire). */
    function cleanup() {
      if (state.rafId !== null) cancelAnimationFrame(state.rafId);
      state.rafId = null;
      if (state.zone && state.onPointer)
        state.zone.removeEventListener("pointermove", state.onPointer);
      state.zone = null;
      state.onPointer = null;
      if (state.cleanTimers.length) {
        state.cleanTimers.forEach((t) => clearTimeout(t));
        state.cleanTimers = [];
      }
      if (state.floaters.length) {
        state.floaters.forEach((f) => {
          clearTimeout(f.timer);
          f.el.remove();
        });
        state.floaters = [];
      }
    }

    /* ---------- Score ---------- */

    /** Bonus de temps (plancher à 0, plafonné pour ne pas dominer le score). */
    function timeBonus(elapsedSeconds) {
      return Math.min(
        TIME_BONUS_MAX,
        Math.max(
          0,
          Math.round((TIME_BONUS_FLOOR_SECONDS - elapsedSeconds) * TIME_BONUS_PER_SECOND)
        )
      );
    }

    function computeScore(elapsedSeconds) {
      return state.scoreBase + state.comboBonus + timeBonus(elapsedSeconds);
    }

    /* ---------- Zone de jeu ---------- */

    function setupZone() {
      const zone = container.querySelector(".ci__play");
      if (!zone) return;
      state.zone = zone;
      const size = zone.getBoundingClientRect();
      const width = size.width || 300;
      const height = size.height || 380;
      state.zoneRect = { left: size.left || 0, top: size.top || 0 };

      state.particles = spawnParticles(width, height, state.particleCount);
      state.remaining = state.particles.length;
      renderParticles();

      const onPointer = (event) => {
        if (state.phase !== "playing" || !state.zoneRect) return;
        const px = event.clientX - state.zoneRect.left;
        const py = event.clientY - state.zoneRect.top;
        let near = false;
        for (const particle of state.particles) {
          if (!particle.active) continue;
          const distance = Math.hypot(px - particle.x, py - particle.y);
          if (distance <= particle.hitR) {
            cleanParticle(particle);
          } else if (distance < 46) {
            near = true;
          }
        }
        if (state.zone) state.zone.classList.toggle("ci__play--near", near);
      };
      state.onPointer = onPointer;
      zone.addEventListener("pointermove", onPointer);

      state.rafId = requestAnimationFrame(tick);
    }

    /* ---------- Rendu des particules / mises à jour ---------- */

    function renderParticles() {
      state.particles.forEach((particle) => {
        const dot = document.createElement("span");
        dot.className = `ci__dot ${particle.cls}`.trim();
        const size = particle.r * 2;
        dot.style.width = `${size}px`;
        dot.style.height = `${size}px`;
        dot.style.left = `${particle.x - particle.r}px`;
        dot.style.top = `${particle.y - particle.r}px`;
        dot.dataset.value = String(particle.value);
        dot.dataset.type = particle.key;
        particle.el = dot;
        state.zone.appendChild(dot);
      });
      updateCountText();
      updateScoreText();
      updateComboText();
    }

    function updateCountText() {
      const el = container.querySelector(".ci__count");
      if (!el) return;
      const label = state.remaining <= 1 ? "particule" : "particules";
      el.textContent = `${state.remaining} ${label}`;
    }

    function updateScoreText() {
      const el = container.querySelector(".ci__score");
      if (!el) return;
      const elapsed = state.startTime ? (performance.now() - state.startTime) / 1000 : 0;
      el.textContent = `Score ${computeScore(elapsed)}`;
    }

    function updateComboText() {
      const el = container.querySelector(".ci__combo");
      if (!el) return;
      el.textContent = state.combo >= 2 ? `🔥 x${state.combo}` : "";
    }

    /* ---------- Nettoyage ---------- */

    function cleanParticle(particle) {
      particle.active = false;
      state.remaining -= 1;

      // combo : nettoyage rapide -> monte ; sinon revient à x1
      const now = performance.now();
      const delta = now - state.lastCleanTime;
      state.combo =
        state.lastCleanTime !== null && delta <= COMBO_WINDOW_MS ? state.combo + 1 : 1;
      state.lastCleanTime = now;
      state.bestCombo = Math.max(state.bestCombo, state.combo);

      const bonus = Math.max(0, (state.combo - 1) * COMBO_BONUS_PER_STEP);
      state.scoreBase += particle.value;
      state.comboBonus += bonus;
      state.score = state.scoreBase + state.comboBonus;

      particle.el.classList.add("ci__dot--gone");
      const timer = setTimeout(() => particle.el.remove(), 300);
      state.cleanTimers.push(timer);

      spawnFloater(particle.x, particle.y - 8, `+${particle.value}`, "value");
      if (state.combo >= 2) spawnFloater(particle.x, particle.y - 26, `🔥 x${state.combo}`, "combo");

      updateCountText();
      updateScoreText();
      updateComboText();
      if (state.remaining <= 0) finish();
    }

    /** Petit texte qui flotte vers le haut puis disparaît (plafonné). */
    function spawnFloater(x, y, text, kind) {
      while (state.floaters.length >= MAX_FLOATERS) {
        const oldest = state.floaters.shift();
        clearTimeout(oldest.timer);
        oldest.el.remove();
      }
      const el = document.createElement("span");
      el.className = `ci__pop ci__pop--${kind}`;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.textContent = text;
      (state.zone || container).appendChild(el);
      const timer = setTimeout(() => {
        el.remove();
        state.floaters = state.floaters.filter((f) => f.el !== el);
      }, 600);
      state.floaters.push({ el, timer });
    }

    /* ---------- Chrono (affichage) ---------- */

    function tick() {
      if (state.phase !== "playing") return;
      const timeEl = container.querySelector(".ci__time");
      if (timeEl) timeEl.textContent = formatSeconds((performance.now() - state.startTime) / 1000);
      state.rafId = requestAnimationFrame(tick);
    }

    /* ---------- Fin de partie ---------- */

    function finish() {
      cleanup();
      const seconds = (performance.now() - state.startTime) / 1000;
      const score = computeScore(seconds);
      state.score = score;
      state.phase = "finished";
      finalizeSession(score, seconds);
      renderFinished(seconds, score);
    }

    /** Enregistre les records une seule fois, à la fin de la partie. */
    function finalizeSession(score, seconds) {
      if (state.finalized) return;
      state.finalized = true;
      state.sessionSummary = recordGameResult(game.id, {
        score,
        bestTime: seconds,
        bestCombo: state.bestCombo,
      });
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

    function renderReady() {
      const count = particleCountFor(game.id);
      container.innerHTML = `
        <div class="game-view fade-in">
          ${head()}
          <div class="ci">
            <p class="ci__label">Clean It</p>
            <p class="ci__hint">Nettoie tout en bougeant la souris. Va vite pour enchaîner les combos.</p>
            <p class="ci__preview">🌫 ${count} particules</p>
            <button class="btn btn--primary ci__btn" data-action="start">COMMENCER</button>
          </div>
        </div>
      `;
    }

    function renderPlaying() {
      const stateCombo = state.combo >= 2 ? `🔥 x${state.combo}` : "";
      container.innerHTML = `
        <div class="game-view fade-in">
          ${head()}
          <div class="ci">
            <div class="ci__bar">
              <span class="ci__count">${state.remaining} particules</span>
              <span class="ci__combo">${stateCombo}</span>
              <span class="ci__time">0.00 s</span>
            </div>
            <div class="ci__play">
              <span class="ci__score">Score 0</span>
            </div>
          </div>
        </div>
      `;
    }

    function renderFinished(seconds, score) {
      const record = state.sessionSummary?.newRecord
        ? `<p class="os-record">🏆 Nouveau record !</p>`
        : "";
      const bestCombo = state.bestCombo > 0 ? `x${state.bestCombo}` : "—";
      const bestTime = state.sessionSummary?.bestTime
        ? `⚡ ${formatSeconds(state.sessionSummary.bestTime)}`
        : "";
      container.innerHTML = `
        <div class="game-view fade-in">
          ${head()}
          <div class="ci-end">
            <p class="ci-end__title">✨ Clean !</p>
            ${record}
            <p class="ci-end__label">Temps</p>
            <p class="ci-end__value">${formatSeconds(seconds)}</p>
            <p class="ci-end__label">Score</p>
            <p class="ci-end__value">${score}</p>
            <p class="ci-end__label">Meilleur combo</p>
            <p class="ci-end__value ci-end__value--sm">${bestCombo}</p>
            ${bestTime ? `<p class="ci-end__record-time">${bestTime}</p>` : ""}
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
      if (action === "start" || action === "replay") return startGame();
    });

    container.__ciUnbind = () => {
      cleanup();
      unbindActions();
      delete container.__ciUnbind;
    };

    renderReady();
  },
};