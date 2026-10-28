# 🗺️ Roadmap PAUSE

Perspectives d'amélioration issues de l'audit de code (octobre 2026), classées par horizon.
Les éléments ~~barrés~~ sont déjà réalisés.

## ✅ Fait (v0.2.0)

- ~~Don't Touch : intégration au système de records (`recordGameResult`, écran « Nouveau record », métriques carte d'accueil).~~
- ~~Clean It : équilibrage du scoring (bonus temps réduit et plafonné à 250 pts).~~
- ~~Clean It : génération des particules O(n²) → O(1) (grille spatiale).~~
- ~~Suppression du code mort (`placeholder.js`, exports/paramètres inutilisés).~~
- ~~DRY : utilitaires partagés `games/shared/ui.js` (`formatSeconds`, `clamp`, `escapeHtml`, `bindActions`).~~
- ~~Sécurité : échappement HTML dans le routeur popup.~~
- ~~Cycle de vie : suivi unifié des unbinds (`pagehide`).~~
- ~~Hygiène dépôt : README, CHANGELOG, LICENSE, ROADMAP, `.gitignore`.~~
- ~~Manifest : `minimum_chrome_version`, version sémantique.~~

## 🔜 Court terme (v0.3)

| # | Tâche | Effort | Impact |
|---|---|---|---|
| C1 | **Documentation des classes CSS dynamiques** : en-tête de section dans `popup.css` listant les variantes composées (`.dt-result--*`, `.ci__pop--*`) ou découpage en partials (`@import`). | ~1 h | Maintenance |
| C2 | **Package npm racine** : `package.json` avec `"scripts": { "test": "npm --prefix tests test" }` pour un point d'entrée unique. | ~10 min | DX |
| C3 | **Intégration continue** : workflow GitHub Actions (Node 20 → `npm ci && npm test`) sur chaque push/PR. | ~1 h | Qualité |
| C4 | **Audit des constantes de gameplay** : centraliser les knobs d'équilibrage (difficulté progressive Clean It, tolérances Don't Touch) dans un `games/balance.js` documenté. | ~2 h | Équilibrage |
| C5 | **Notes de version Store** : générer une description courte/longue pour la fiche Chrome Web Store depuis CHANGELOG. | ~30 min | Release |

## 📐 Moyen terme (v0.4 – v0.5)

| # | Tâche | Effort | Impact |
|---|---|---|---|
| M1 | **Migration du harness vers ESM natif Node** : remplacer le parseur regex d'imports par `node:module` + import maps / réexport explicite ; supprimer les limitations connues (import default, side-effect imports, `export {a,b}` multiline). | ~2 h | Robustesse tests |
| M2 | **Mode sombre complet** : variables CSS déjà en place → thème `prefers-color-scheme` + bascule manuelle persistée dans `stats.js` (clé `settings`). | ~3 h | UX |
| M3 | **Page d'options** (`chrome.storage.sync`) : préférences (thème, son/muet, unités) synchronisées entre machines ; nécessite la permission `storage` — à déclarer et justifier dans la politique de confidentialité. | ~4 h | Produit |
| M4 | **Statistiques agrégées** : vue « Total » (toutes sessions confondues) — temps total joué, parties/jour, série de jours consécutifs (streak). Extension naturelle du schéma versionné (→ `version: 2` avec migration). | ~5 h | Rétention |
| M5 | **Export / import des stats** : bouton JSON dans les options (backup/restauration), avec re-validation par la sanitisation existante. | ~2 h | Confiance |
| M6 | **Refonte cycle de vie des jeux** : contrat commun `mount()/unmount()` vérifié par un test générique itérant sur `GAMES` (chaque jeu doit libérer rAF/timers/listeners). | ~3 h | Dette technique |

## 🌱 Long terme (v1.0+)

| # | Tâche | Effort | Impact |
|---|---|---|---|
| L1 | **Quatrième jeu** : candidat « respiration guidée » (box breathing) — cohérent avec la promesse « pause relaxante », réutilise le registre sans toucher au popup. | ~6 h | Produit |
| L2 | **Succès / défis transverses** : badges calculés depuis les stats locales (ex. « 10 parties », « combo ×5 »), affichés sur les cartes d'accueil. | ~8 h | Engagement |
| L3 | **Localisation** : chaîne i18n via `chrome.i18n` (fr/en) — extraire les littéraux aujourd'hui en dur dans JS + HTML. | ~10 h | Audience |
| L4 | **Support clavier / accessibilité renforcée** : alternatives jouables au clavier pour Don't Touch et Clean It (focus, tabulation, aria-live sur les scores). | ~12 h | Inclusion |
| L5 | **Port Edge / Firefox** : Firefox MV3 (compatible Chrome API quasi totale) — tester, ajuster `browser_action`, publier sur AMO. | ~6 h | Diffusion |
| L6 | **Analytics anonymes optionnels** (opt-in strict, aucun identifiant) pour équilibrer les jeux — ⚠️ à ne faire qu'avec politique de confidentialité mise à jour et transparence UI. | ~10 h | Données |

## 🧹 Dette permanente (fil rouge)

- Garder `popup.css` (<1 200 l.) découpé dès qu'un quatrième jeu arrive.
- Chaque nouveau jeu DOIT passer par `recordGameResult` (à rendre obligatoire via le contrat M6).
- Tenir CHANGELOG + `manifest.json:version` synchronisés à chaque PR.
