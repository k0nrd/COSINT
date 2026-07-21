# Release notes — v1.8.3

> Texte prêt à coller dans la GitHub Release (section anglaise d'abord, française
> ensuite, comme les README).

---

## 🇬🇧 English

### ✏️ Edit right on the timeline

Clicking an event on the frise now opens **the exact same editor as the board** in the
bottom-right panel — title, structured fields, colour, tags, event dating, delete. You
edit the **data** without ever going back to the canvas; **“See on the board”** is still
there when you want the graph.

### 🖐️ Reshape a range visually

Ranges are now **draggable**:

- **slide a bar** to move the whole event in time;
- **grab an end cap** to adjust the **start** or the **finish**;
- **double-click** a bar to drop a **marker**, **drag** it to move it, **right-click** to
  remove it;
- **drag a card** to move a precise date.

Every gesture is committed on release as **one undo step**. Hovering a bar shows a
selection outline — the same cue as entities/events — to signal it’s clickable **and**
editable.

### 📏 New bar styles

- a **duration** (from → to) is a **solid, continuous line**;
- an **uncertain range** (earliest / latest) is a **continuous line hatched in grey** — the
  old fading gradient is gone;
- **both** now carry **clear end caps** at the start and the finish.

### 🎚️ Premiere-style zoom bar

The bottom bar becomes a **zoom navigator** with a handle at each end:

- **widen** the handle (drag an edge outward) → **zoom out**;
- **narrow** it (drag an edge inward) → **zoom in**;
- **drag the middle** → scroll.

The `+` / `−` buttons and **Recenter** remain in the toolbar.

### 🎯 One dating *or* the other

A **precise date** and a **time range** are now **mutually exclusive** — three clear,
exclusive natures: **Precise date**, **Uncertain range** (earliest / latest), **Duration**
(from → to). Switching clears the others. A range can carry **markers**, placed directly
from the timeline.

### 🧹 Lighter timeline

- the descriptive banner (“Events timeline — when the facts happened. Drag the
  background…”) is **removed**;
- a **Return to board** button now sits in the **bottom toolbar**.

### Under the hood

- `.trace` format still **v7** — new **optional** `eventMarks` (markers on a range),
  read defensively and backward compatible (older files open unchanged; files with
  markers open in older builds ignoring them).
- New pure logic in `lib/timeline.ts` (`datationMode`, markers filtered to the resolved
  range); the board’s `NodeDetails` editor is reused verbatim on the frise.
- New unit tests (dating mode; markers filtered/sorted; markers round-trip).
  **248 tests total**, production build OK.

---

## 🇫🇷 Français

### ✏️ Édition directement sur la frise

Cliquer un événement ouvre désormais **le même éditeur que le tableau** dans le panneau
en bas à droite — titre, champs structurés, couleur, tags, datation, suppression. On
modifie les **données** sans repasser par le canvas ; **« Voir sur le tableau »** reste
là quand on veut le graphe.

### 🖐️ Remodeler une plage visuellement

Les plages sont maintenant **glissables** :

- **glissez une barre** pour déplacer tout l’événement dans le temps ;
- **attrapez un embout** pour ajuster le **début** ou la **fin** ;
- **double-cliquez** une barre pour poser un **repère**, **glissez-le** pour le déplacer,
  **clic droit** pour le retirer ;
- **glissez une carte** pour déplacer une date précise.

Chaque geste est validé au relâcher, en **une seule annulation**. Survoler une barre
affiche un contour de sélection — le même repère que les entités/événements — pour
signaler qu’elle est cliquable **et** modifiable.

### 📏 Nouvelles barres

- une **durée** (de → à) est un **trait plein et continu** ;
- une **fourchette incertaine** (au plus tôt / au plus tard) est un **trait continu
  hachuré de gris** — fini le dégradé qui s’estompe ;
- **les deux** portent désormais des **embouts nets** au début et à la fin.

### 🎚️ Barre de zoom façon Premiere Pro

La barre du bas devient un **navigateur de zoom** avec une poignée à chaque bout :

- **élargir** la poignée (tirer un bord vers l’extérieur) → **dézoom** ;
- **rétrécir** (tirer un bord vers l’intérieur) → **zoom** ;
- **glisser le milieu** → défiler.

Les boutons `+` / `−` et **Recentrer** restent dans la barre d’outils.

### 🎯 L’une *ou* l’autre

Une **date précise** et une **fourchette de temps** sont désormais **exclusives** — trois
natures claires et exclusives : **Date précise**, **Fourchette** incertaine (au plus tôt /
au plus tard), **Durée** (de → à). Changer de mode efface les autres. Une fourchette peut
porter des **repères**, posés directement depuis la frise.

### 🧹 Frise allégée

- le bandeau descriptif (« Frise des événements — quand les faits se sont déroulés.
  Glissez le fond… ») est **supprimé** ;
- un bouton **Revenir au tableau** s’ajoute à la **barre d’outils du bas**.

### Sous le capot

- Format `.trace` toujours **v7** — nouveau champ **optionnel** `eventMarks` (repères sur
  une plage), lu défensivement et rétro-compatible (les fichiers plus anciens s’ouvrent
  inchangés ; un fichier avec repères s’ouvre dans une version antérieure en les ignorant).
- Logique pure enrichie dans `lib/timeline.ts` (`datationMode`, repères filtrés à la plage
  résolue) ; l’éditeur `NodeDetails` du tableau est réutilisé tel quel sur la frise.
- Nouveaux tests unitaires (mode de datation ; repères filtrés/triés ; aller-retour des
  repères). **248 tests au total**, build de production OK.
