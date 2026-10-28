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

/** Borne `value` dans [min, max]. Entrée non finie -> renvoie `min`. */
export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
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

/** Délégation de clic sur `[data-action]` : retourne le unbind.
    Pattern commun aux trois jeux (plus besoin de le recopier). */
export function bindActions(container, handler) {
  const listener = (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || !container.contains(button)) return;
    handler(button.dataset.action, button);
  };
  container.addEventListener("click", listener);
  return () => container.removeEventListener("click", listener);
}
