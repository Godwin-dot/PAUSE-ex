# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versionnage suivant [SemVer](https://semver.org/lang/fr/).

## [0.2.0] — 2026-10-29

### Ajouté
- **Don't Touch : intégration au système de records** — chaque réussite est
  enregistrée via `recordGameResult` (score + meilleur temps), avec retour visuel
  « Nouveau record ! » sur l'écran de fin et métriques sur la carte d'accueil.
- **Utilitaires partagés** (`games/shared/ui.js`) : `formatSeconds`, `clamp`,
  `escapeHtml`, `bindActions` (délégation d'événements `data-action`).
- **Hygiène dépôt** : README, CHANGELOG, LICENSE (MIT), ROADMAP, `.gitignore` enrichi.
- **Manifest** : `minimum_chrome_version: "116"`.

### Modifié
- **Équilibrage Clean It** : bonus de temps réduit (40 → 10 pts/s) et plafonné à
  250 pts afin qu'il ne domine plus le score total.
- **Performance Clean It** : génération des particules passée de O(n²) à O(1)
  (grille spatiale pour le test de chevauchement).
- **Popup** : échappement HTML des chaînes injectées (prévention XSS future) ;
  suivi explicite des unbinds au cycle de vie des pages (`pagehide`).
- **Harness de test** : globals supplémentaires dans le sandbox (`Map`, `Set`,
  `Promise`…), parsing d'imports renforcé.

### Corrigé
- **Don't Touch** : clampage du score négatif (`Math.max(0, …)`).
- **shared/ui.js** : durcissement de `clamp()` contre les valeurs non numériques.

### Retiré
- Code mort : `popup/placeholder.js` (jamais importé), exports inutilisés
  (`getGame` conservé comme API publique du registre, paramètres fantômes supprimés).

## [0.1.0]

### Ajouté
- Extension Chrome Manifest V3 : popup PAUSE avec routeur multi-pages.
- **One Second** : estimation de durée, 5 manches, combos, précision %.
- **Clean It** : nettoyage de particules au curseur, difficulté progressive.
- **Don't Touch** : labyrinthe souris, collisions cercle-rectangle tolérées,
  position logique séparée du rendu interpolé.
- Couche `storage/stats.js` : schéma versionné, sanitisation, repli sur données corrompues.
- Suite de tests jsdom avec harness déterministe (horloge, rAF, timers flushables).
