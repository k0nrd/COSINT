# Release notes — v1.8.5

> Texte prêt à coller dans la GitHub Release (section anglaise d'abord, française
> ensuite, comme les README).

---

## 🇬🇧 English

A small polish release focused on the **timeline (frise)** — plus **Linux builds** now
ship alongside Windows.

### 🎚️ Neutral zoom navigator

The bottom **widen / thin** bar was blue — it looked permanently *selected*. It is now a
**neutral grey**: **dark grey** on the dark theme, **light grey** on the light theme (it
follows the mode automatically). No accent colour anymore.

### 🏷️ Cleaner event labels

Event cards no longer carry the **coloured left stripe** (it looked templated, and the
colour is already shown on the range bar). Instead:

- a **range** (uncertain fork / duration) shows its colour on its **bar**;
- a **precise date** keeps a **slim coloured position marker** planted at the exact moment
  — so you still see *where* on the frise the event sits, without the stripe look.

### 🎨 Coloured uncertainty bars

The **hatched** *uncertain fork* ranges were always grey. They now use the **event's own
colour** — a red "crime" event between two dates shows a **red hatched** bar, over a faint
tinted background and matching end caps.

### 🐧 Linux builds

COSINT now ships for **Linux** too: a portable **AppImage** and a **Debian/Ubuntu `.deb`**,
built next to the Windows installer and portable.

### Under the hood

- Timeline changes are **visual only** — the `.trace` format is unchanged (still **v7**),
  fully backward compatible.
- No new strings, no data-model change; **251 tests total**, production build OK,
  Windows + Linux packaged.

---

## 🇫🇷 Français

Une petite mise à jour de finition centrée sur la **frise** — et les **builds Linux**
arrivent enfin, aux côtés de Windows.

### 🎚️ Navigateur de zoom neutre

La barre du bas pour **élargir / rétrécir** était bleue — on aurait dit qu'elle était
*sélectionnée* en permanence. Elle est désormais d'un **gris neutre** : **gris foncé** sur
le thème sombre, **gris clair** sur le thème clair (elle suit le mode automatiquement).
Plus aucune couleur d'accent.

### 🏷️ Étiquettes d'événement épurées

Les cartes d'événement ne portent plus le **liseré coloré à gauche** (ça faisait « trop
généré », et la couleur figure déjà sur la barre de plage). À la place :

- une **plage** (fourchette incertaine / durée) montre sa couleur sur sa **barre** ;
- une **date précise** conserve un **fin repère de position coloré** planté au moment exact
  — on voit toujours *où* l'événement se situe sur la frise, sans l'effet liseré.

### 🎨 Barres d'incertitude colorées

Les fourchettes incertaines **hachurées** étaient toujours grises. Elles prennent
maintenant la **couleur propre de l'événement** — un événement « crime » rouge entre deux
dates s'affiche en **hachures rouges**, sur un léger fond teinté et avec des embouts
assortis.

### 🐧 Builds Linux

COSINT est désormais aussi packagé pour **Linux** : un **AppImage** portable et un paquet
**Debian/Ubuntu `.deb`**, produits à côté de l'installeur et du portable Windows.

### Sous le capot

- Les changements de frise sont **purement visuels** — le format `.trace` est inchangé
  (toujours **v7**), totalement rétro-compatible.
- Aucune nouvelle chaîne, aucun changement de modèle de données ; **251 tests au total**,
  build de production OK, packaging Windows + Linux.
