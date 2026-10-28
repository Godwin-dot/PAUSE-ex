# ⏸️ PAUSE

**PAUSE** est une extension Chrome (Manifest V3) : un petit popup de détente avec des
mini-jeux simples et relaxants. Aucune permission, aucun réseau, aucune donnée envoyée
ailleurs que dans le `localStorage` local du navigateur.

## 🎮 Jeux inclus

| Jeu | Principe | Record |
|---|---|---|
| **One Second** | Estimer 1 seconde (ou une durée cible) le plus précisément possible, en 5 manches avec combos. | Meilleure précision (%) |
| **Clean It** | Nettoyer un nuage de particules au curseur avant qu'elles ne se reforment. Score = particules + combo + bonus vitesse (plafonné). | Meilleur score & meilleur temps |
| **Don't Touch** | Traverser un labyrinthe à la souris sans effleurer les obstacles. Position logique (collision) séparée du rendu (interpolation). | Meilleur score & meilleur temps |

Chaque partie enregistrée met à jour les statistiques locales ; un écran « Nouveau record »
s'affiche quand un seuil est battu.

## 📁 Structure

```
manifest.json          # MV3, popup uniquement (pas de background, pas de permissions)
popup/                 # HTML, CSS et routeur du popup (délégation data-action)
games/
  games.js             # Registre GAMES — point d'extension pour ajouter un jeu
  shared/ui.js         # Utilitaires UI partagés (formatSeconds, clamp, escapeHtml, bindActions)
  one-second/          # Module du jeu One Second
  clean-it/            # Module du jeu Clean It
  don-touch/           # Module du jeu Don't Touch
storage/stats.js       # Couche localStorage versionnée + sanitisation
tests/                 # Harness jsdom maison + suites de tests
icons/                 # Icônes 16 / 48 / 128 px
```

### Architecture clé

- **Registre générique** : `GAMES` dans `games/games.js`. Le popup déduit les métriques
  affichées *des données* (`bestTime`, `bestAccuracy`…) et non des identifiants de jeux —
  ajouter un jeu n'exige aucune modification du routeur.
- **Storage robuste** : schéma versionné (`version: 1`), sanitisation stricte
  (`Number.isFinite`, bornes ≥ 0), repli propre sur données corrompues, try/catch
  lecture + écriture. Toute écriture passe par `recordGameResult()`.
- **Timing fiable** : les mesures de gameplay reposent exclusivement sur
  `performance.now()` ; `requestAnimationFrame` ne sert qu'à l'affichage.

## 🚀 Installation (mode développeur)

1. Cloner ou télécharger ce dépôt.
2. Ouvrir `chrome://extensions`.
3. Activer **Mode développeur** (coin supérieur droit).
4. **Charger une extension non empaquetée** → sélectionner le dossier `PAUSE/`.
5. Cliquer sur l'icône PAUSE dans la barre d'outils.

> Prérequis : Chrome ≥ 116 (pointer events modernes, Manifest V3).

## 🧪 Tests

Les tests utilisent un harness `jsdom` maison avec horloge déterministe, file rAF
flushable et rechargement de modules simulant fermeture/réouverture du popup.

```bash
cd tests
npm install
npm test
```

Suite actuelle : stats, clean-it, one-second, dont-touch, popup — toutes vertes ✅

## 📦 Mise en production (Chrome Web Store)

1. Mettre à jour `version` dans `manifest.json` et renseigner `CHANGELOG.md`.
2. Créer le paquet : zippler **le contenu** du dossier (pas le dossier lui-même),
   sans `node_modules/` ni `tests/` :
   ```bash
   zip -r pause-v0.2.0.zip manifest.json popup games storage icons
   ```
3. Uploader sur https://chrome.google.com/webstore/developer/dashboard (frais unique 5 $).
4. Fournir captures d'écran, description et politique de confidentialité
   (« les données restent locales » → déclaration simple).

## 🗺️ Feuille de route

Voir [ROADMAP.md](ROADMAP.md) pour les perspectives à court/moyen/long terme.

## 📄 Licence

MIT — voir [LICENSE](LICENSE).
