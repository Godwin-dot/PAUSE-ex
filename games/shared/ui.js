/* =========================================================
   PAUSE — Utilitaires partagés entre les vues et les jeux
   ---------------------------------------------------------
   Petit socle commun : formatage, math, échappement HTML.
   Évite les duplications (formatSeconds / clamp recopiés
   dans chaque jeu et dans le popup).
   ========================================================= */

/** Formate une durée en secondes pour l'affichage. */
export function formatSeconds(value) {
  return `${value.toFixed(2)} s`;
}

/** Borne `value` dans [min, max]. */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Échappe une chaîne pour une interpolation textuelle dans innerHTML. */
export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
