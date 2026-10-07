# Release notes — v1.9.2

> Texte prêt à coller dans la GitHub Release (section anglaise d'abord, française
> ensuite, comme les README).

---

## 🇬🇧 English

**The interface redesign started in 1.9.1 now reaches the timeline, the sources and the
CSV import, with a round of visual polish and fixes. No feature removed, no change to
your boards, to the `.trace` format or to the peer-to-peer protocol.**

### 🎨 Interface

- **Timeline**: event cards alternate above and below the axis (icon, date, title, type,
  status); a **table of the events** sits under the timeline; title, count, tabs, date
  range, exports and "Back to canvas" share a single header.
- **Sources**: each source shows its title, address, date, reliability and the number of
  attached elements; the sort is a segmented control and the report export sits at the
  bottom of the panel.
- **CSV import**: numbered steps (click a previous step to go back), two panes, a sample
  value next to each column, and the file name in the title bar.
- **Board**: more compact entity cards, softer status colours, thinner links, discreet
  selection halo.

Existing boards keep the colours and node sizes they were saved with.

### 🐛 Fixes

- The first element added to an empty board no longer opens at 400 % zoom.
- Status badges no longer grow oversized in the timeline filter when the board is zoomed
  out.
- The timeline is framed on all its events again after switching between timeline and
  list, or between tabs.
- With the details panel open, the timeline actions (PNG, CSV, Back to canvas) are no
  longer hidden behind it.
- Spacing restored above the "Generate a share code" button.

### 🔧 Under the hood

- The `.trace` format stays at **v7** and the protocol is unchanged. As with every
  release, **update every computer of a team**: a member on 1.9.2 refuses a join request
  coming from an older version.
- `npm audit --omit=dev` reports no known vulnerability in the shipped application.
- **578 tests**, production build OK.

---

## 🇫🇷 Français

**La refonte de l'interface commencée en 1.9.1 s'étend à la chronologie, aux sources et à
l'import CSV, avec une passe de finitions et de correctifs. Aucune fonctionnalité retirée,
aucun changement pour vos tableaux, le format `.trace` ou le protocole pair-à-pair.**

### 🎨 Interface

- **Chronologie** : les cartes d'événement alternent au-dessus et au-dessous de l'axe
  (icône, date, titre, type, statut) ; un **tableau des événements** s'affiche sous la
  frise ; titre, décompte, onglets, période, exports et « Revenir au canvas » tiennent
  dans un seul en-tête.
- **Sources** : chaque source affiche son titre, son adresse, sa date, sa fiabilité et le
  nombre d'éléments rattachés ; le tri est un contrôle segmenté et l'export du rapport se
  trouve en bas du panneau.
- **Import CSV** : étapes numérotées (un clic sur une étape précédente y revient), deux
  volets, un exemple de valeur à côté de chaque colonne, et le nom du fichier dans la
  barre de titre.
- **Tableau** : fiches d'entité plus compactes, couleurs de statut adoucies, liens plus
  fins, halo de sélection discret.

Les tableaux existants conservent les couleurs et les tailles de nœuds enregistrées.

### 🐛 Correctifs

- Le premier élément ajouté à un tableau vide ne s'ouvre plus à 400 % de zoom.
- Les pastilles de statut ne deviennent plus géantes dans le filtre de la chronologie
  quand le tableau est dézoomé.
- La frise est de nouveau cadrée sur tous ses événements après un passage frise ↔ liste
  ou un changement d'onglet.
- Panneau de détails ouvert, les actions de la chronologie (PNG, CSV, Revenir au canvas)
  ne passent plus dessous.
- Espacement rétabli au-dessus du bouton « Générer un code de partage ».

### 🔧 Sous le capot

- Le format `.trace` reste en **v7** et le protocole est inchangé. Comme à chaque version,
  **mettez à jour tous les postes d'une équipe** : un membre en 1.9.2 refuse la demande
  d'accès d'un poste resté sur une version antérieure.
- `npm audit --omit=dev` ne signale aucune vulnérabilité connue dans l'application livrée.
- **578 tests**, build de production OK.
