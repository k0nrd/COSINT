# Release notes — v1.8.6

> Texte prêt à coller dans la GitHub Release (section anglaise d'abord, française
> ensuite, comme les README).

---

## 🇬🇧 English

A polish release: COSINT is now **trilingual (French / English / Polish)**, the **timeline**
gains leader lines and a richer dated-add, and a batch of small **interaction fixes** across
the timeline and the board.

### 🌍 Trilingual — French, English & Polish

The **entire interface** is now translated. Pick your language:

- at **download / install** — the Windows installer opens with a **language selector**;
- anytime in **Settings → Appearance** (applies live, no restart);
- new installs **default to your system language**.

Dates and numbers follow the chosen locale. A README is available in each language.

### 🧵 Timeline leader lines

Thin **threads** now connect each event to its **date on the top axis**: an event running
**04/12 → 07/12** draws two hairlines, one from each end of its bar up to the axis. Selecting
an event reveals the exact date at the top of each thread.

### 🗓️ Dated add — precise date, duration or range

Adding a dated element from the timeline no longer forces a single exact date. You now choose
between a **precise date**, a **duration** (*from → to*) or an **uncertainty range**
(*earliest → latest*) — the same three-mode dating the board editor uses.

### 🖱️ Timeline interaction fixes

- **No more stray text-selection** when you resize a bar — dragging an end cap used to
  highlight every date and label like copyable text; it doesn't anymore.
- A discreet **"Hold [Ctrl] to move / resize …"** hint now appears when you try to drag a bar
  without holding the modifier (a plain click keeps selecting).
- That **hold key is configurable** — Ctrl, Alt or Shift — in **Settings → Shortcuts**.

### 🔗 Cleaner link drawing

While **drawing a link's path**, clicking over a **zone/group** no longer selects it beneath
your waypoint — element selection is suspended for the duration of the draw.

### 🔄 Updates in 100 % local mode

100 % local mode kept update checks off by design. A new opt-in **"Keep updates enabled
(contacts GitHub Releases)"** box lets closed-network installs still be notified of new
versions — and the *"What the app will contact"* recap honestly flags GitHub as the single
public contact when you enable it.

### 🎛️ Refreshed onboarding & settings

The first-run profile screen and the Settings dialog were reworked to feel less templated —
an editorial layout with a brand lockup, accent-marked section headers, and a segmented
language switch.

### Under the hood

- New in-app strings for the three locales live in `src/renderer/src/i18n/` (`fr`, `en`, `pl`),
  each typed to the same key set (a missing key breaks the build).
- The `.trace` format is **unchanged (v7)**, fully backward compatible; no data-model change.
- **253 tests total**, production build OK, Windows + Linux packaged.

---

## 🇫🇷 Français

Une mise à jour de finition : COSINT devient **trilingue (français / anglais / polonais)**, la
**frise** gagne des fils de repère et un ajout daté enrichi, et un lot de petites **corrections
d'interaction** sur la frise et le tableau.

### 🌍 Trilingue — français, anglais & polonais

**Toute l'interface** est désormais traduite. Choisissez la langue :

- au **téléchargement / à l'installation** — l'installeur Windows s'ouvre avec un **sélecteur
  de langue** ;
- à tout moment dans **Paramètres → Apparence** (appliquée en direct, sans redémarrage) ;
- les nouvelles installations suivent **la langue du système** par défaut.

Dates et nombres suivent la langue choisie. Un README est disponible dans chaque langue.

### 🧵 Fils de repère sur la frise

De fins **fils** relient désormais chaque événement à sa **date, en haut sur l'axe** : un
événement du **04/12 au 07/12** trace deux filaments, un depuis chaque extrémité de sa barre
jusqu'à l'axe. Sélectionner un événement révèle la date exacte au sommet de chaque fil.

### 🗓️ Ajout daté — date précise, durée ou fourchette

Ajouter un élément daté depuis la frise n'impose plus une seule date exacte. On choisit
maintenant entre une **date précise**, une **durée** (*de → à*) ou une **fourchette**
d'incertitude (*au plus tôt → au plus tard*) — la même datation à trois modes que l'éditeur
du tableau.

### 🖱️ Corrections d'interaction sur la frise

- **Fini la sélection de texte parasite** au redimensionnement d'une barre — glisser un embout
  surlignait toutes les dates et étiquettes comme du texte à copier ; c'est corrigé.
- Un indice discret **« Maintenez [Ctrl] pour déplacer / redimensionner … »** apparaît quand
  on tente de glisser une barre sans maintenir le modificateur (un simple clic sélectionne).
- Cette **touche de maintien est configurable** — Ctrl, Alt ou Maj — dans
  **Paramètres → Raccourcis**.

### 🔗 Tracé de lien plus net

Pendant le **tracé du chemin d'un lien**, cliquer par-dessus une **zone/un groupe** ne la
sélectionne plus sous votre point de passage — la sélection des éléments est suspendue le
temps du tracé.

### 🔄 Mises à jour en mode 100 % local

Le mode 100 % local coupait les mises à jour par principe. Une nouvelle case **« Garder les
mises à jour activées (contacte GitHub Releases) »** permet aux installations en réseau fermé
d'être quand même averties des nouvelles versions — et le récapitulatif *« Ce que l'application
contactera »* signale honnêtement GitHub comme seul contact public quand on l'active.

### 🎛️ Accueil & paramètres retravaillés

L'écran de profil de première ouverture et la fenêtre Paramètres ont été retravaillés pour
faire moins « gabarit » — mise en page éditoriale avec bloc de marque, en-têtes de section
marqués d'un repère d'accent, et bascule de langue segmentée.

### Sous le capot

- Les nouvelles chaînes des trois langues vivent dans `src/renderer/src/i18n/` (`fr`, `en`,
  `pl`), toutes typées sur le même jeu de clés (une clé manquante casse le build).
- Le format `.trace` est **inchangé (v7)**, totalement rétro-compatible ; aucun changement de
  modèle de données.
- **253 tests au total**, build de production OK, packaging Windows + Linux.
