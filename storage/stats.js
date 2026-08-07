/* =========================================================
   PAUSE — Statistiques locales
   ---------------------------------------------------------
   Stockage LOCAL (localStorage), versionné et générique.

   Chaque mini-jeu possède ses propres statistiques, sous la
   clé "games" du document :

     {
       version: 1,
       games: {
         "one-second": {
           bestScore:    0,
           bestAccuracy: null,   // plus PETIT = meilleur (secondes)
           bestTime:     null,   // plus PETIT = meilleur (secondes, ex. Clean It)
           bestCombo:    0,
           gamesPlayed:  0
         }
       }
     }

   Choix de métrique :
   - "gamesPlayed" = nombre de sessions terminées (une session
     One Second = une partie de 5 manches).
   - "bestAccuracy" (One Second) et "bestTime" (Clean It) sont
     des durées en secondes : plus PETIT = meilleur.
   - Il n'y a PAS de second compteur "sessionsCompleted" :
     ce serait redondant avec gamesPlayed.

   Robustesse :
     - aucune donnée        -> valeurs par défaut ;
     - données corrompues   -> repli propre sur les défauts ;
     - l'écriture est centralisée ici (aucun appel localStorage
       ailleurs dans l'application).
   ========================================================= */

const STORAGE_KEY = "pause:stats";
const VERSION = 1;

const DEFAULT_GAME_STATS = {
  bestScore: 0,
  bestAccuracy: null,
  bestTime: null,
  bestCombo: 0,
  gamesPlayed: 0,
};

function defaultGameStats() {
  return { ...DEFAULT_GAME_STATS };
}

/** Nettoie une entrée de jeu : ne conserve que des valeurs numériques fiables. */
function sanitizeGame(raw) {
  const stats = defaultGameStats();
  if (raw && typeof raw === "object") {
    if (Number.isFinite(raw.bestScore) && raw.bestScore >= 0) stats.bestScore = raw.bestScore;
    if (Number.isFinite(raw.bestAccuracy) && raw.bestAccuracy >= 0) stats.bestAccuracy = raw.bestAccuracy;
    if (Number.isFinite(raw.bestTime) && raw.bestTime >= 0) stats.bestTime = raw.bestTime;
    if (Number.isFinite(raw.bestCombo) && raw.bestCombo >= 0) stats.bestCombo = raw.bestCombo;
    if (Number.isFinite(raw.gamesPlayed) && raw.gamesPlayed >= 0) stats.gamesPlayed = raw.gamesPlayed;
  }
  return stats;
}

/** Nettoie le document complet, en ignorant toute partie invalide de l'entrée. */
function sanitizeData(raw) {
  const data = { version: VERSION, games: {} };
  if (raw && typeof raw === "object" && raw.games && typeof raw.games === "object") {
    for (const id of Object.keys(raw.games)) {
      data.games[id] = sanitizeGame(raw.games[id]);
    }
  }
  return data;
}

function present() {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

function loadData() {
  return sanitizeData(present());
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("[PAUSE] Impossible d'enregistrer les statistiques :", error);
  }
}

/** Retourne une copie des stats d'un jeu (défauts si aucune donnée). */
export function getGameStats(gameId) {
  const data = loadData();
  const stats = data.games[gameId];
  return stats ? { ...stats } : defaultGameStats();
}

/** Retourne toutes les stats connues (objet id -> stats). */
export function getAllGameStats() {
  return loadData().games;
}

/**
 * Enregistre le résultat d'une session terminée.
 * Met à jour les records (max pour score/combo, min pour précision/temps)
 * et incrémente gamesPlayed de 1.
 *
 * Métriques génériques (toutes optionnelles) :
 *   - score        -> record MAX
 *   - bestAccuracy -> record MIN (secondes)
 *   - bestTime     -> record MIN (secondes)
 *   - bestCombo    -> record MAX
 *
 * @param {string} gameId - identifiant du mini-jeu
 * @param {object} session - { score, bestAccuracy, bestTime, bestCombo }
 * @returns {object} stats mises à jour + drapeaux `newScoreRecord`,
 *   `newTimeRecord`, `newComboRecord`, `newRecord` (au moins un record battu)
 */
export function recordGameResult(gameId, session) {
  const data = loadData();
  const previous = data.games[gameId] || defaultGameStats();

  const score = Number.isFinite(session?.score) ? session.score : 0;
  const accuracy = session?.bestAccuracy ?? null;
  const time = session?.bestTime ?? null;
  const combo = Number.isFinite(session?.bestCombo) ? session.bestCombo : 0;

  const newScoreRecord = score > previous.bestScore;
  const newTimeRecord = time !== null && (previous.bestTime === null || time < previous.bestTime);
  const newComboRecord = combo > previous.bestCombo;
  const newRecord = newScoreRecord || newTimeRecord || newComboRecord;

  const nextAccuracy =
    accuracy === null
      ? previous.bestAccuracy
      : previous.bestAccuracy === null
        ? accuracy
        : Math.min(previous.bestAccuracy, accuracy);

  const nextTime =
    time === null
      ? previous.bestTime
      : previous.bestTime === null
        ? time
        : Math.min(previous.bestTime, time);

  data.games[gameId] = {
    bestScore: Math.max(previous.bestScore, score),
    bestAccuracy: nextAccuracy,
    bestTime: nextTime,
    bestCombo: Math.max(previous.bestCombo, combo),
    gamesPlayed: previous.gamesPlayed + 1,
  };

  saveData(data);
  return { ...data.games[gameId], newScoreRecord, newTimeRecord, newComboRecord, newRecord };
}

/** Efface toutes les statistiques enregistrées. */
export function resetAll() {
  saveData({ version: VERSION, games: {} });
}