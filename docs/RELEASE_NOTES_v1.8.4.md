# Release notes — v1.8.4

> Texte prêt à coller dans la GitHub Release (section anglaise d'abord, française
> ensuite, comme les README).

---

## 🇬🇧 English

### 🎨 Graphical edits now show on the timeline

Change an element's **colour** in the editor and its **bar / card updates live** on the
frise (previously the frise kept the type colour and ignored your change). The timeline
now mirrors the element's actual look.

### 🏷️ Editable markers

The markers you drop on a range (fork / duration) are no longer bare ticks — each one now
carries a **title, a colour and tags**:

- **click** a marker to open its little editor on the right (title, colour, tags, delete);
- its **title** shows as a caption on the frise and its **colour** on the diamond;
- **right-click** a marker to remove it.

### ⌨️ Ctrl + drag to move (no more accidents)

Visual editing now requires **Ctrl (⌘) held**:

- **Ctrl + drag** a bar to move it in time, **Ctrl + drag** an end cap to adjust
  start/finish, **Ctrl + drag** a marker to move it;
- a **plain click** just **selects** (a bar, a card or a marker);
- **click empty space** to **deselect**.

### 📏 Slimmer, tidier chrome

- the bottom **zoom navigator** is now much more **compact** (it took too much room next to
  the toolbar);
- the **detail panel** on the right no longer leaves **empty space above** the content.

### Under the hood

- `.trace` format still **v7** — markers become **objects** (`{ id, at, label?, color?,
  tags? }`) instead of bare timestamps. Fully backward compatible: a v1.8.3 file whose
  markers were plain numbers is upgraded automatically (each gets an id).
- Shared `sanitizeEventMarks` used by the CRDT, the file loader and the timing op; the
  timeline colour is now derived from the node's own colour.
- New unit tests (marker sanitising: objects + legacy numbers, invalids dropped, sorted;
  round-trip). **251 tests total**, production build OK.

---

## 🇫🇷 Français

### 🎨 Les modifications graphiques s'appliquent enfin sur la frise

Changez la **couleur** d'un élément dans l'éditeur et sa **barre / carte se met à jour en
direct** sur la frise (avant, la frise gardait la couleur du type et ignorait le
changement). La frise reflète désormais l'apparence réelle de l'élément.

### 🏷️ Repères éditables

Les repères posés sur une plage (fourchette / durée) ne sont plus de simples traits —
chacun porte désormais un **titre, une couleur et des tags** :

- **cliquez** un repère pour ouvrir son petit éditeur à droite (titre, couleur, tags,
  suppression) ;
- son **titre** s'affiche en légende sur la frise et sa **couleur** sur le losange ;
- **clic droit** sur un repère pour le retirer.

### ⌨️ Ctrl + glisser pour déplacer (fini les accidents)

L'édition visuelle exige désormais **Ctrl (⌘) maintenu** :

- **Ctrl + glisser** une barre la déplace dans le temps, **Ctrl + glisser** un embout
  ajuste le début/la fin, **Ctrl + glisser** un repère le déplace ;
- un **simple clic** ne fait que **sélectionner** (une barre, une carte ou un repère) ;
- **cliquez dans le vide** pour **désélectionner**.

### 📏 Interface resserrée

- le **navigateur de zoom** du bas est bien plus **compact** (il prenait trop de place à
  côté de la barre d'outils) ;
- le **panneau de détail** à droite ne laisse plus d'**espace vide au-dessus** du contenu.

### Sous le capot

- Format `.trace` toujours **v7** — les repères deviennent des **objets** (`{ id, at,
  label?, color?, tags? }`) au lieu de simples horodatages. Totalement rétro-compatible :
  un fichier v1.8.3 dont les repères étaient de simples nombres est converti
  automatiquement (chacun reçoit un id).
- `sanitizeEventMarks` partagé par le CRDT, le chargeur de fichiers et l'op de datation ;
  la couleur sur la frise dérive maintenant de la couleur propre du nœud.
- Nouveaux tests unitaires (normalisation des repères : objets + nombres hérités,
  invalides écartés, triés ; aller-retour). **251 tests au total**, build de production OK.
