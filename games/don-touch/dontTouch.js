/* =========================================================
   PAUSE — Don't Touch
   ---------------------------------------------------------
   Mini-jeu de précision et d'évitement : guider un petit
   point du départ vers la cible sans toucher les obstacles.

   Machine à états simple :
     ready   -> « Atteins la cible sans toucher les obstacles. »
     playing -> le point suit le pointeur ; chrono (perf.now)
     success -> ✨ RÉUSSI ! (temps affiché)
     failed  -> 💥 TOUCHÉ ! (écran d'échec)

   Étape 10 — intégration au système de records :
     - chaque réussite est enregistrée via recordGameResult
       (score dérivé du temps + gamesPlayed + 1) ;
     - écran de succès enrichi : « 🏆 Nouveau record ! », meilleur
       temps en mémoire, parties jouées ;
     - les échecs ne produisent AUCUNE écriture dans le storage.

   Étape 9 — refonte du contrôle souris :
     - coordonnées converties via getBoundingClientRect() ;
     - une position LOGIQUE (le curseur) et une position VISUELLE
       (interpolée par requestAnimationFrame) ;
     - collision indépendante du rendu : on évalue sur la position
       logique du pointeur (déterministe, sans latence) ;
     - vraie collision cercle vs rectangle + marge configurable ;
     - le point est limité à la zone en tenant compte de son rayon ;
     - feedbacks : armé (contour), proximité (halo), impact 💥 puis
       OUPS, étincelle ✨ puis RÉUSSI ; un seul balayage rAF.
   ========================================================= */

import { recordGameResult } from "../../storage/stats.js";
import { formatSeconds, clamp, bindActions } from "../shared/ui.js";

/* --- Paramètres réglables (le + central : la sensation souris) --- */
import {
  DT_COLLISION_TOLERANCE as COLLISION_TOLERANCE,
  DT_SMOOTHING as SMOOTHING,
  DT_SCORE_BASE as SCORE_BASE,
  DT_SCORE_FLOOR_SECONDS as SCORE_FLOOR_SECONDS,
  DT_SCORE_PER_SECOND as SCORE_PER_SECOND,
} from "../balance.js";

export const PLAYER_RADIUS = 8; // rayon du cœur visuel du point (px)
export const COLLISION_TOLERANCE = DT_COLLISION_TOLERANCE; // marge de pardon (px), rend la collision juste
export const SMOOTHING = DT_SMOOTHING; // interpolation curseur (ré-exportée pour les tests)
export const SNAP_THRESHOLD = 0.4; // sous ce delta, on colle au curseur (anti-tremblement)
export const PROXIMITY_MARGIN = 24; // distance (px) d'alerte de proximité d'un obstacle
export const BOOM_DELAY = 150; // feedback 💥 avant l'écran (ms)
export const SPARKLE_DELAY = 120; // feedback ✨ avant l'écran (ms)

/* --- Scoring d'une réussite (dérivé du temps, cohérent avec Clean It) --- */
// SCORE_BASE / SCORE_FLOOR_SECONDS / SCORE_PER_SECOND viennent de games/balance.js

/** Score d'une partie réussie : socle + bonus vitesse (plancher à 0). */
export function scoreForTime(seconds) {
  // clamp : un temps négatif (ou nul) ne doit JAMAIS dépasser le plafond de bonus
  const s = clamp(Number.isFinite(seconds) ? seconds : SCORE_FLOOR_SECONDS, 0, SCORE_FLOOR_SECONDS);
  const speedBonus = Math.round((SCORE_FLOOR_SECONDS - s) * SCORE_PER_SECOND);
  return SCORE_BASE + speedBonus;
}

/* Obstacles en coordonnées normalisées (x,y,w,h en % de la zone).
   Configurations dessinées à la main, garanties solvables. */
const LAYOUTS = [
  {
    id: "weave",
    start: { x: 4, y: 78, w: 16, h: 16 },
    target: { x: 78, y: 2, w: 16, h: 12 },
    obstacles: [
      { x: 22, y: 58, w: 66, h: 10 },
      { x: 0, y: 34, w: 44, h: 10 },
      { x: 56, y: 14, w: 44, h: 10 },
    ],
  },
  {
    id: "serpent",
    start: { x: 4, y: 80, w: 16, h: 14 },
    target: { x: 4, y: 6, w: 16, h: 14 },
    obstacles: [
      { x: 20, y: 64, w: 76, h: 10 },
      { x: 0, y: 42, w: 76, h: 10 },
      { x: 20, y: 20, w: 76, h: 10 },
    ],
  },
  {
    id: "corners",
    start: { x: 76, y: 80, w: 16, h: 14 },
    target: { x: 4, y: 6, w: 16, h: 14 },
    obstacles: [
      { x: 0, y: 64, w: 76, h: 10 },
      { x: 24, y: 42, w: 76, h: 10 },
      { x: 0, y: 20, w: 76, h: 10 },
    ],
  },
];

/** Retourne une config en évitant de rejouer immédiatement la dernière. */
function pickLayout(previousId) {
  let pool = LAYOUTS;
  if (previousId) pool = LAYOUTS.filter((layout) => layout.id !== previousId);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Convertit une coordonnée normalisée (%) en pixels dans la zone. */
function toPx(value, span) {
  return (value / 100) * span;
}

/** Le point `cx,cy` de rayon `r` touche-t-il le rectangle `rect` ?
    Collision cercle vs rectangle : point du rect le plus proche. */
function circleHitsRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/* Contrat d'un objet `game` (commun aux trois jeux) :
   { id, emoji, title, description, mount(container) }
   - `mount` doit rendre l'écran READY et installer un écouteur "click"
     délégué via [data-action] ;
   - `mount` doit appeler son propre `<id>Unbind()` s'il existe encore
     (fermeture/réouverture du popup sans démontage natif) ;
   - `<id>Unbind` annule rAF, timers, listeners et DOM temporaire. */
export const game = {
  id: "don-touch",
  emoji: "🚫",
  title: "Don't Touch",
  description: "Rejoins la cible sans toucher les obstacles.",

  mount(container) {
    if (container.__dtUnbind) container.__dtUnbind();

    const state = {
      phase: "ready",
      ended: false,
      armed: false,
      proxied: false,
      layout: null,
      rect: null, // { left, top, width, height } de la zone
      zones: null, // { start, target, obstacles } rects en px
      logical: { x: 0, y: 0 }, // position (curseur), = vérité de collision
      visual: { x: 0, y: 0 }, // position interpolée, = rendu
      dotEl: null,
      rafId: null,
      startTime: 0,
      timeouts: [],
      booms: [],
      zone: null,
      onPointer: null,
      onPointerLeave: null,
      sessionSummary: null, // résumé des records après une réussite
    };

    /* ---------- Actions ---------- */

    function start() {
      state.phase = "playing";
      state.ended = false;
      state.armed = false;
      state.proxied = false;
      clearTimers();
      clearBooms();
      state.layout = pickLayout(state.layout?.id);
      state.sessionSummary = null;
      state.startTime = performance.now();
      renderPlaying();
    }

    function back() {
      // Nettoyage systématique quelle que soit la phase (comme Clean It).
      dispose();
      container.dispatchEvent(new CustomEvent("back"));
    }

    function evaluate() {
      if (state.phase !== "playing" || state.ended) return;
      const p = state.logical;

      // Pas encore « en jeu » : il faut d'abord être passé par le départ.
      if (!state.armed) {
        if (inside(state.zones.start, p.x, p.y)) {
          state.armed = true;
          updateAppearance();
        }
        return;
      }

      if (inside(state.zones.target, p.x, p.y) && !state.ended) {
        reachTarget();
      } else if (state.zones.obstacles.some((r) =>
          circleHitsRect(p.x, p.y, PLAYER_RADIUS - COLLISION_TOLERANCE, r)
        ) && !state.ended) {
        crash();
      }
    }

    /** Atteinte de la cible : court feedback ✨ puis écran succès. */
    function reachTarget() {
      state.ended = true;
      const seconds = (performance.now() - state.startTime) / 1000;
      stopLoop();
      // Seules les réussites sont enregistrées (les échecs n'écrivent rien).
      state.sessionSummary = recordGameResult(game.id, {
        score: scoreForTime(seconds),
        bestTime: seconds,
      });
      spawnBoom("✨", state.visual.x, state.visual.y);
      schedule(SPARKLE_DELAY, () => {
        state.phase = "success";
        renderResult("success", seconds);
      });
    }

    /** Collision : bref feedback 💥 puis écran d'échec (non-bloquant). */
    function crash() {
      if (state.ended) return;
      state.ended = true;
      stopLoop();
      spawnBoom("💥", state.visual.x, state.visual.y);
      schedule(BOOM_DELAY, () => {
        state.phase = "failed";
        renderResult("failed", null);
      });
    }

    /* ---------- Chrono & interpolation (balayage rAF unique) ---------- */

    function tick() {
      if (state.phase !== "playing") return;

      const timeEl = container.querySelector(".dt__time");
      if (timeEl) {
        timeEl.textContent = formatSeconds((performance.now() - state.startTime) / 1000);
      }

      // Interpolation légère de la position visuelle vers la position logique.
      const dx = state.logical.x - state.visual.x;
      const dy = state.logical.y - state.visual.y;
      if (Math.abs(dx) < SNAP_THRESHOLD && Math.abs(dy) < SNAP_THRESHOLD) {
        state.visual.x = state.logical.x;
        state.visual.y = state.logical.y;
      } else {
        state.visual.x += dx * SMOOTHING;
        state.visual.y += dy * SMOOTHING;
      }

      paintDot();
      updateAppearance();
      state.rafId = requestAnimationFrame(tick);
    }

    function updateAppearance() {
      if (!state.dotEl) return;
      state.proxied = state.armed && nearObstacle(state.visual.x, state.visual.y);
      state.dotEl.classList.toggle("dt--armed", state.armed);
      state.dotEl.classList.toggle("dt--prox", state.proxied);
    }

    /** Le point visuel est-il proche d'un obstacle ? (alerte subtile) */
    function nearObstacle(x, y) {
      return state.zones.obstacles.some((r) =>
        circleHitsRect(x, y, PLAYER_RADIUS + PROXIMITY_MARGIN, r)
      );
    }

    /* ---------- Pointeur ---------- */

    function onPointerMove(event) {
      if (state.phase !== "playing" || !state.rect) return;
      // Conversion globale -> locale (indépendant de la fenêtre / zoom)
      const px = event.clientX - state.rect.left;
      const py = event.clientY - state.rect.top;

      // Hors de la zone : on retient la dernière position valide.
      if (px < 0 || py < 0 || px > state.rect.width || py > state.rect.height) return;

      // Limitation : le cœur du point reste entièrement visible.
      state.logical.x = clamp(px, PLAYER_RADIUS, state.rect.width - PLAYER_RADIUS);
      state.logical.y = clamp(py, PLAYER_RADIUS, state.rect.height - PLAYER_RADIUS);

      evaluate();
    }

    function onPointerLeave() {
      state.proxied = false;
      if (state.dotEl) state.dotEl.classList.remove("dt--prox");
    }

    /* ---------- Nettoyage ---------- */

    function stopLoop() {
      if (state.rafId !== null) cancelAnimationFrame(state.rafId);
      state.rafId = null;
      if (state.zone) {
        if (state.onPointer) state.zone.removeEventListener("pointermove", state.onPointer);
        if (state.onPointerLeave) state.zone.removeEventListener("pointerleave", state.onPointerLeave);
      }
      state.onPointer = null;
      state.onPointerLeave = null;
    }

    function clearTimers() {
      state.timeouts.forEach((t) => clearTimeout(t));
      state.timeouts = [];
    }

    function clearBooms() {
      state.booms.forEach((el) => el.remove());
      state.booms = [];
    }

    /** Libération complète : tout est stoppé, rien ne peut fuir ni accéder au DOM. */
    function dispose() {
      stopLoop();
      clearTimers();
      clearBooms();
      state.zone = null;
      state.dotEl = null;
      state.rect = null;
      state.zones = null;
    }

    function schedule(ms, cb) {
      const id = setTimeout(() => {
        state.timeouts = state.timeouts.filter((t) => t !== id);
        cb();
      }, ms);
      state.timeouts.push(id);
    }

    function spawnBoom(text, x, y) {
      const el = document.createElement("span");
      el.className = "dt__boom";
      el.textContent = text;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      const parent = state.zone || container;
      if (parent) parent.appendChild(el);
      state.booms.push(el);
      const timer = setTimeout(() => {
        el.remove();
        state.booms = state.booms.filter((b) => b !== el);
      }, 300);
      state.timeouts.push(timer);
    }

    /* ---------- Zone & géométrie ---------- */

    function buildZones(zone, layout) {
      const size = zone.getBoundingClientRect();
      const width = size.width || 320;
      const height = size.height || 340;
      const left = size.left || 0;
      const top = size.top || 0;
      state.rect = { left, top, width, height };

      return {
        start: rectToPx(layout.start, width, height),
        target: rectToPx(layout.target, width, height),
        obstacles: layout.obstacles.map((o) => rectToPx(o, width, height)),
      };
    }

    function rectToPx(rect, width, height) {
      return {
        x: toPx(rect.x, width),
        y: toPx(rect.y, height),
        w: toPx(rect.w, width),
        h: toPx(rect.h, height),
      };
    }

    function inside(rect, x, y) {
      return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
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
      container.innerHTML = `
        <div class="game-view fade-in">
          ${head()}
          <div class="dt">
            <p class="dt__label">DON'T TOUCH</p>
            <p class="dt__hint">Atteins la cible sans toucher les obstacles.</p>
            <button class="btn btn--primary dt__btn" data-action="start">COMMENCER</button>
          </div>
        </div>
      `;
    }

    function renderPlaying() {
      container.innerHTML = `
        <div class="game-view fade-in">
          ${head()}
          <div class="dt">
            <div class="dt__bar">
              <span>Départ → cible</span>
              <span class="dt__time">0.00 s</span>
            </div>
            <div class="dt__play">
              <span class="dt__start"></span>
              <span class="dt__target"></span>
              ${state.layout.obstacles.map(() => '<span class="dt__obs"></span>').join("")}
              <span class="dt__dot"></span>
            </div>
            <p class="dt__hint">Glisse ton point jusqu'à la cible.</p>
          </div>
        </div>
      `;
      setupPlayZone();
    }

    function setupPlayZone() {
      const zone = container.querySelector(".dt__play");
      if (!zone) return; // défensif
      state.zone = zone;
      state.zones = buildZones(zone, state.layout);
      position(zone.querySelector(".dt__start"), state.zones.start);
      position(zone.querySelector(".dt__target"), state.zones.target);
      state.zones.obstacles.forEach((rect, i) =>
        position(zone.querySelectorAll(".dt__obs")[i], rect)
      );

      // Le point démarre au centre de la zone de départ (logique = visuelle).
      const c = centerOf(state.zones.start);
      state.logical.x = c.x;
      state.logical.y = c.y;
      state.visual.x = c.x;
      state.visual.y = c.y;

      state.dotEl = zone.querySelector(".dt__dot");
      paintDot();

      state.onPointer = onPointerMove;
      state.onPointerLeave = onPointerLeave;
      zone.addEventListener("pointermove", onPointerMove);
      zone.addEventListener("pointerleave", onPointerLeave);
      state.rafId = requestAnimationFrame(tick);
    }

    function centerOf(rect) {
      return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    }

    function position(el, rect) {
      if (!el || !rect) return;
      el.style.left = `${rect.x}px`;
      el.style.top = `${rect.y}px`;
      el.style.width = `${rect.w}px`;
      el.style.height = `${rect.h}px`;
    }

    function paintDot() {
      if (state.dotEl) {
        state.dotEl.style.transform =
          `translate(${state.visual.x}px, ${state.visual.y}px) translate(-50%, -50%)`;
      }
    }

    function renderResult(kind, seconds) {
      const isSuccess = kind === "success";
      const title = isSuccess ? "✨ RÉUSSI !" : "OUPS !";
      const sub = isSuccess
        ? "Bravo !"
        : "Tu as touché un obstacle.";
      const action = isSuccess ? "REJOUER" : "REESSAYER";

      const summary = state.sessionSummary;
      const recordLine =
        isSuccess && summary?.newRecord
          ? `<p class="os-record">🏆 Nouveau record !</p>`
          : "";
      const scoreLine = isSuccess
        ? `<p class="dt-result__label">Score</p>
           <p class="dt-result__time dt-result__score">${scoreForTime(seconds)}</p>`
        : "";
      const bestLine =
        isSuccess && summary?.bestTime != null
          ? `<p class="dt-result__record-time">⚡ Meilleur temps : ${formatSeconds(summary.bestTime)} · ${summary.gamesPlayed} partie${summary.gamesPlayed > 1 ? "s" : ""}</p>`
          : "";

      container.innerHTML = `
        <div class="game-view fade-in">
          ${head()}
          <div class="dt-result dt-result--${kind}">
            <p class="dt-result__title">${title}</p>
            ${sub ? `<p class="dt-result__sub">${sub}</p>` : ""}
            ${isSuccess ? `<p class="dt-result__label">Temps</p>` : ""}
            ${isSuccess ? `<p class="dt-result__time">${formatSeconds(seconds)}</p>` : ""}
            ${recordLine}
            ${scoreLine}
            ${bestLine}
            <div class="os-end__actions">
              <button class="btn btn--primary os__btn" data-action="restart">${action}</button>
              <button class="btn btn--ghost os__btn" data-action="back">ACCUEIL</button>
            </div>
          </div>
        </div>
      `;
    }

    /* ---------- Liaison des actions (délégation partagée) ---------- */

    const unbindActions = bindActions(container, (action) => {
      if (action === "back") return back();
      if (action === "start" || action === "restart") return start();
    });

    container.__dtUnbind = () => {
      dispose();
      unbindActions();
      delete container.__dtUnbind;
    };

    renderReady();
  },
};