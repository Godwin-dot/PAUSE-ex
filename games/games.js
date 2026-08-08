/* =========================================================
   PAUSE — Registre des mini-jeux
   ---------------------------------------------------------
   Point d'extension principal. Pour ajouter un nouveau jeu,
   créer un module dans /games/<id>/ et enregistrer son
   objet `game` ici (voir games/one-second/oneSecond.js).
   ========================================================= */

import { game as oneSecond } from "./one-second/oneSecond.js";
import { game as cleanIt } from "./clean-it/cleanIt.js";
import { game as donTouch } from "./don-touch/dontTouch.js";

export const GAMES = [oneSecond, cleanIt, donTouch];

/**
 * Retrouve un jeu par son identifiant.
 * @param {string} id
 * @returns {object | undefined}
 */
export function getGame(id) {
  return GAMES.find((game) => game.id === id);
}