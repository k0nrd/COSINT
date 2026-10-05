# Release notes — v1.9.1

> Texte prêt à coller dans la GitHub Release (section anglaise d'abord, française
> ensuite, comme les README).

---

## 🇬🇧 English

**A redesigned interface — calmer, denser, more professional — on an up-to-date
technical base. No change to your boards, to the `.trace` format or to the peer-to-peer
protocol.**

### 🎨 New interface

- **Neutral graphite theme** (dark and light): fewer colours, thin borders, one accent
  reserved for selection and focus. The main action is a light button, not a blue one.
- **Bundled fonts** (IBM Plex Sans / Mono, embedded in the app — nothing is downloaded):
  the same rendering on every computer, and monospace for technical data (codes, dates).
- **Home**: sidebar with the actions, boards as a list (name, sharing, last opened), and a
  **"join with a code" field** right in the header.
- **First launch** on two columns, with a reminder of what the application does and does
  not do (no central server, no telemetry, sharing by code).
- **Board**: toolbar docked as a rail (left/right) or floating (top/bottom), **search and
  undo/redo in the top bar**, a **status bar** (elements, links, selection, zoom) and a
  clearer empty board.
- **Add an entity**: two panes — categories on the left, types on the right; **Enter**
  picks the first result.
- **Details panel**: identity header (icon, "Category · Type", title); the icon picker
  opens from the icon. **Legend** and **Sources** dock on the right like the details panel.
- **Sharing**: the code and its Copy button on one line.
- Entity cards show "Category · Type" in their header; category colours are softer.

Existing boards keep the colours and node sizes they were saved with.

### 🔧 Under the hood

- **Electron 43** (was 33), electron-builder 26, vitest 5 — `npm audit` reports no known
  vulnerability. Building from source now needs **Node.js ≥ 22.12**.
- **Continuous integration** (GitHub Actions): type-check, tests, build and packaging on
  Windows and Linux for every push and pull request; a `vX.Y.Z` tag builds both platforms
  and prepares the release as a draft. CodeQL analysis and Dependabot updates.
- The `.trace` format stays at **v7** and the protocol is unchanged. As with every
  release, **update every computer of a team**: a member on 1.9.1 refuses a join request
  coming from an older version.
- **578 tests**, production build OK.

Interface redesign by [w4ll-i](https://github.com/w4ll-i).

---

## 🇫🇷 Français

**Une interface refondue — plus sobre, plus dense, plus professionnelle — sur une base
technique à jour. Aucun changement pour vos tableaux, le format `.trace` ou le protocole
pair-à-pair.**

### 🎨 Nouvelle interface

- **Thème graphite neutre** (sombre et clair) : moins de couleurs, bordures fines, un seul
  accent réservé à la sélection et au focus. L'action principale est un bouton clair, plus
  un bouton bleu.
- **Polices embarquées** (IBM Plex Sans / Mono, incluses dans l'application — rien n'est
  téléchargé) : le même rendu sur tous les postes, et du monospace pour les données
  techniques (codes, dates).
- **Accueil** : barre latérale avec les actions, tableaux en liste (nom, partage, dernière
  ouverture), et un **champ « rejoindre avec un code »** directement dans l'en-tête.
- **Premier lancement** sur deux colonnes, avec le rappel de ce que l'application fait et
  ne fait pas (aucun serveur central, aucune télémétrie, partage par code).
- **Tableau** : barre d'outils ancrée en rail (gauche/droite) ou flottante (haut/bas),
  **recherche et annuler/rétablir dans la barre supérieure**, une **barre d'état**
  (éléments, liens, sélection, zoom) et un tableau vide plus clair.
- **Ajouter une entité** : deux volets — catégories à gauche, types à droite ; **Entrée**
  choisit le premier résultat.
- **Panneau de détails** : en-tête d'identité (icône, « Catégorie · Type », titre) ; le
  sélecteur d'icône s'ouvre depuis l'icône. La **Légende** et les **Sources** s'ancrent à
  droite comme le panneau de détails.
- **Partage** : le code et son bouton Copier sur une même ligne.
- Les fiches d'entité affichent « Catégorie · Type » dans leur en-tête ; les couleurs de
  catégorie sont adoucies.

Les tableaux existants conservent les couleurs et les tailles de nœuds enregistrées.

### 🔧 Sous le capot

- **Electron 43** (au lieu de 33), electron-builder 26, vitest 5 — `npm audit` ne signale
  aucune vulnérabilité connue. Construire depuis les sources demande désormais
  **Node.js ≥ 22.12**.
- **Intégration continue** (GitHub Actions) : typecheck, tests, build et empaquetage sous
  Windows et Linux à chaque push et pull request ; un tag `vX.Y.Z` construit les deux
  plates-formes et prépare la release en brouillon. Analyse CodeQL et mises à jour
  Dependabot.
- Le format `.trace` reste en **v7** et le protocole est inchangé. Comme à chaque version,
  **mettez à jour tous les postes d'une équipe** : un membre en 1.9.1 refuse la demande
  d'accès d'un poste resté sur une version antérieure.
- **578 tests**, build de production OK.

Refonte de l'interface par [w4ll-i](https://github.com/w4ll-i).
