# Release notes — v1.8.2

> Texte prêt à coller dans la GitHub Release (section anglaise d'abord, française
> ensuite, comme les README).

---

## 🇬🇧 English

### 🕒 Timelines, reworked

- **"Additions" now means *when you added it*** — an element always appears on the
  **Additions** frise at its **creation date**, never at its event date. An Instagram
  account dated *8 March* but entered on *20 July* shows under *8 March* on **Events** and
  under *20 July* on **Additions** (previously it wrongly showed on 8 March in both).
- **Horizontal toolbar at the bottom** — on the timeline, the vertical left toolbar is
  replaced by a **horizontal bar at the bottom**: add elements, zoom, recenter.
- **Add on the timeline only *with a date*** — adding an entity/note from the frise opens
  a small date picker first; **without a date, nothing is created**. The date is the
  event date, so the new element appears on the Events frise straight away.
- **Free panning + "Recenter"** — you can now drag left/right **beyond the last element**,
  and a **Recenter** button brings the view back onto the elements (like the canvas
  "fit").

### ⏱️ Precise durations (from / to)

Event dating now offers two natures, side by side:

- **Instant** — an exact date, or an **uncertainty window** ("earliest / latest": the
  fact happened *somewhere between*).
- **Duration** — a real span, **from … to …** (a stay, a campaign — the fact *extends*
  over the whole range).

Switching mode clears the other nature's fields (never mixed data). Durations are stored
and exported (`.trace` v7, CSV columns `evenement_duree_de` / `evenement_duree_a`).

### 🎨 Cleaner timeline visuals

Ranges are no longer an abrupt dotted bar. Each nature is drawn distinctly: a **duration**
is a **solid bar with clear end caps**; an **uncertainty window** is a **bar that fades at
both ends** (blurred bounds). Flat and restrained, consistent with the theme.

### 🚀 Update window

When a new version is published on GitHub, a small, dismissible **pop-up** announces it
with the **version** and a **link to the GitHub release**. Once downloaded, it offers
"Restart to install"; a discreet banner then remains as a reminder.

### Under the hood

- `.trace` format **v7** — new optional `eventFrom` / `eventTo` fields (backward
  compatible: older files open unchanged; v7 files open in older builds ignoring them).
- New pure-logic in `lib/timeline.ts` (`eventTimingOf` handles instant / window /
  duration), new `UpdatePopup` component.
- New unit tests (dating: instant vs window vs duration; Additions frise sorted by add
  date). **244 tests total**, production build OK.

---

## 🇫🇷 Français

### 🕒 Frises retravaillées

- **« Ajouts » = *quand vous l'avez ajouté*** — un élément figure toujours sur la frise
  **Ajouts** à sa **date de création**, jamais à sa date d'événement. Un compte Instagram
  daté du *8 mars* mais saisi le *20 juillet* apparaît au *8 mars* dans **Événements** et
  au *20 juillet* dans **Ajouts** (avant, il apparaissait à tort au 8 mars dans les deux).
- **Barre d'outils horizontale en bas** — sur la frise, la barre verticale de gauche
  laisse place à une **barre horizontale en bas** : ajout d'éléments, zoom, recentrage.
- **Ajout sur la frise seulement *avec une date*** — ajouter une entité/note depuis la
  frise ouvre d'abord un petit sélecteur de date ; **sans date, rien n'est créé**. La date
  est celle de l'événement : le nouvel élément apparaît aussitôt sur la frise Événements.
- **Déplacement libre + « Recentrer »** — on peut désormais glisser à gauche/droite
  **au-delà du dernier élément**, et un bouton **Recentrer** ramène la vue sur les
  éléments (comme le « recentrer » du tableau).

### ⏱️ Durées précises (de / à)

La datation d'événement propose deux natures, côte à côte :

- **Instant** — une date exacte, ou une **fenêtre d'incertitude** (« au plus tôt / au plus
  tard » : le fait s'est produit *quelque part entre*).
- **Durée** — une plage réelle, **de … à …** (un séjour, une campagne — le fait *s'étend*
  sur toute la plage).

Changer de mode efface les champs de l'autre nature (jamais de donnée mixte). Les durées
sont stockées et exportées (`.trace` v7, colonnes CSV `evenement_duree_de` /
`evenement_duree_a`).

### 🎨 Visuel de la frise plus net

Une plage n'est plus un pointillé qui s'arrête brusquement. Chaque nature est dessinée
distinctement : une **durée** est un **trait plein à embouts nets** ; une **fenêtre
d'incertitude** est un **trait estompé aux deux bouts** (bornes floues). À plat et sobre,
cohérent avec le thème.

### 🚀 Fenêtre de mise à jour

Quand une nouvelle version est publiée sur GitHub, une petite **fenêtre** refermable
l'annonce avec le **numéro de version** et un **lien vers la release GitHub**. Une fois
téléchargée, elle propose « Redémarrer pour installer » ; une bannière discrète subsiste
ensuite comme rappel.

### Sous le capot

- Format `.trace` **v7** — nouveaux champs optionnels `eventFrom` / `eventTo`
  (rétro-compatible : les fichiers plus anciens s'ouvrent inchangés ; un v7 s'ouvre dans
  une version antérieure en les ignorant).
- Logique pure enrichie dans `lib/timeline.ts` (`eventTimingOf` gère instant / fenêtre /
  durée), nouveau composant `UpdatePopup`.
- Nouveaux tests unitaires (datation : instant vs fenêtre vs durée ; frise Ajouts triée
  par date d'ajout). **244 tests au total**, build de production OK.
