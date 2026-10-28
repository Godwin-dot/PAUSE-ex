/* =========================================================
   PAUSE — Balance globale (knobs d'équilibrage)
   ---------------------------------------------------------
   Regroupe les constantes qui définissent la DIFFICULTÉ et
   le SCORING des jeux, pour pouvoir les ajuster sans ouvrir
   chaque module de jeu. Les constantes purement techniques
   (rayons de rendu, délais de feedback, fenêtres d'animation)
   restent dans leur module respectif.

   Convention : un préfixe par jeu (os_ / ci_ / dt_).
   Toute modification ici DOIT être accompagnée d'une mise à
   jour des tests concernés (tests/*.test.mjs).
   ========================================================= */

/* --- One Second : sessions & scoring --- */
export const OS_ROUNDS_PER_SESSION = 5; // manches par partie
export const OS_COMBO_BONUS_STEP = 10; // points par marche de combo
export const OS_COMBO_BONUS_MAX = 50; // plafond du bonus combo (combo >= 6)

/* --- Clean It : difficulté progressive & scoring --- */
export const CI_BASE_PARTICLE_COUNT = 30; // particules au premier lancement
export const CI_MAX_PARTICLE_COUNT = 45; // plafond de la difficulté progressive
export const CI_PARTICLES_PER_GAME = 2; // +N particules par partie déjà jouée
export const CI_COMBO_WINDOW_MS = 500; // délai max entre deux nettoyages pour combo
export const CI_COMBO_BONUS_PER_STEP = 15; // points par marche de combo
export const CI_TIME_BONUS_FLOOR_SECONDS = 50; // au-delà, plus de bonus vitesse
export const CI_TIME_BONUS_PER_SECOND = 10; // points par seconde gagnée
export const CI_TIME_BONUS_MAX = 250; // plafond : le bonus ne domine pas le score

/* --- Don't Touch : sensation souris & scoring --- */
export const DT_COLLISION_TOLERANCE = 2; // marge de pardon (px) sur les collisions
export const DT_SMOOTHING = 0.88; // interpolation curseur (plus haut = moins de latence)
export const DT_SCORE_BASE = 200; // socle garanti à chaque réussite
export const DT_SCORE_FLOOR_SECONDS = 40; // au-delà, plus de bonus vitesse
export const DT_SCORE_PER_SECOND = 5; // points par seconde gagnée sous le plancher
