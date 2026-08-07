/* =========================================================
   PAUSE — Écran placeholder
   ---------------------------------------------------------
   Écran temporaire affiché tant que le gameplay d'un jeu
   n'est pas développé. Sera remplacé par les vrais écrans
   de jeu au fil des étapes.
   ========================================================= */

/**
 * Affiche l'écran "bientôt développé" dans le conteneur.
 * @param {HTMLElement} container - nœud racine de la vue jeu
 * @param {object} game - entrée du registre (emoji, title)
 */
export function renderPlaceholder(container, game) {
  container.innerHTML = `
    <div class="game-view fade-in">
      <div class="game-view__head">
        <button class="btn btn--ghost" data-action="back" aria-label="Retour">←</button>
        <span class="game-view__name">${game.emoji} ${game.title}</span>
      </div>
      <div class="placeholder">
        <span class="placeholder__emoji">🌿</span>
        <p class="placeholder__text">Bientôt disponible</p>
        <p class="placeholder__hint">
          Le gameplay de ${game.title} sera développé dans la prochaine étape.
        </p>
      </div>
    </div>
  `;

  container
    .querySelector('[data-action="back"]')
    .addEventListener("click", () => container.dispatchEvent(new CustomEvent("back")));
}
