# Release notes — v1.8.1

> Texte prêt à coller dans la GitHub Release (section anglaise d'abord, française
> ensuite, comme les README).

---

## 🇬🇧 English

### 🕒 Timelines you can actually explore

- **Pan both timelines** — drag the background to move around; the frise is no longer
  static (wheel/trackpad still scroll).
- **No more tangling when sorting** — sorting events by category/type/name kept the
  cards' visual position (by date) but scrambled their stacking, causing overlaps.
  Lane packing is now computed left-to-right by date regardless of the chosen sort.
- **Click shows details on the timeline** — clicking an event or entity no longer jumps
  straight to the board. A **detail card** opens *on the frise* (type, status, author,
  add/event dates, recorded info); **"See on the board"** is the only action that
  switches to the canvas.
- **Events first** — opening the timelines now shows the **Events** frise first, then
  **Additions**, and the Additions view gets a clearer descriptive header.

### 🖼️ Copy a board image into another document

Select an image node → **Copy** button (top-right), or press **Ctrl+C** on a single
image. The bitmap lands on the system clipboard so you can paste it straight into a
word processor, email, chat… Pasting back *inside* COSINT still recreates the full
node (both formats are placed on the clipboard).

### 🔗 Discreet "link these?" suggestions

When you enter information that already appears elsewhere on the board (e.g. the same
phone number on another entity), a small, dismissible prompt offers to **link** the two
elements — nothing intrusive, and you decide.

### 🧩 Dedicated modules per entity type

Like the social-network picker, several entity types now offer **rich, searchable
lists**: banks, cryptocurrencies, brands, telecom operators, countries, card networks,
hash algorithms. **The lists are never limiting** — an **"Other / free value"** entry is
always available (the real lists are gigantic and evolving). Stored values stay plain
text, so fields remain portable and backward-compatible.

### 🚀 GitHub & updates

- Auto-update / publish now targets **github.com/k0nrd/COSINT**.

### Under the hood

- New IPC `app:copy-image` (multi-format clipboard write), new `catalogs` +
  `matching` modules, `assignLanes` made order- and width-aware.
- New field kinds (`bank`, `crypto`, `brand`, `operator`, `country`, `card`,
  `hash_algo`) accepted by the CRDT sanitizer — no data loss on load.
- New unit tests (shared-info matching, lane packing regardless of sort). 240 tests total.

---

## 🇫🇷 Français

### 🕒 Des frises que l'on parcourt vraiment

- **Déplacement sur les deux frises** — glissez le fond pour vous déplacer ; la frise
  n'est plus statique (molette/pavé tactile continuent de faire défiler).
- **Fini l'emmêlement au tri** — trier les événements par catégorie/type/nom gardait la
  position (par date) mais mélangeait l'empilement des cartes, d'où des chevauchements.
  L'attribution des voies se calcule désormais de gauche à droite par date, quel que
  soit le tri choisi.
- **Le clic affiche le détail sur la frise** — cliquer un événement ou une entité
  n'emmène plus directement au tableau. Une **carte de détail** s'ouvre *sur la frise*
  (type, statut, auteur, dates d'ajout/d'événement, informations saisies) ; **« Voir sur
  le tableau »** est la seule action qui bascule vers le canvas.
- **Événements d'abord** — l'ouverture des frises montre d'abord la frise
  **Événements**, puis **Ajouts**, dont l'interface reçoit un en-tête descriptif plus
  clair.

### 🖼️ Copier une image du tableau vers un autre document

Sélectionnez un nœud image → bouton **Copier** (en haut à droite), ou **Ctrl+C** sur une
image seule. Le bitmap est posé sur le presse-papiers système : collez-le directement
dans un traitement de texte, un e-mail, une messagerie… Le collage *dans* COSINT recrée
toujours le nœud complet (les deux formats sont posés sur le presse-papiers).

### 🔗 Suggestions discrètes « relier ? »

Quand vous saisissez une information qui figure déjà ailleurs sur le tableau (par ex. le
même numéro de téléphone sur une autre entité), une petite proposition discrète et
refermable propose de **relier** les deux éléments — rien d'intrusif, c'est vous qui
décidez.

### 🧩 Des modules propres à chaque type d'entité

À la manière du sélecteur de réseau social, plusieurs types d'entité proposent
désormais des **listes riches et cherchables** : banques, cryptomonnaies, marques,
opérateurs télécom, pays, réseaux de carte, algorithmes de hachage. **Les listes ne sont
jamais limitantes** — une entrée **« Autre / valeur libre »** est toujours disponible
(les listes réelles sont gigantesques et évolutives). Les valeurs stockées restent du
texte simple : les champs demeurent portables et rétro-compatibles.

### 🚀 GitHub & mises à jour

- La mise à jour automatique / publication cible désormais **github.com/k0nrd/COSINT**.

### Sous le capot

- Nouvel IPC `app:copy-image` (écriture presse-papiers multi-format), nouveaux modules
  `catalogs` + `matching`, `assignLanes` rendu robuste à l'ordre et à la largeur.
- Nouvelles natures de champ (`bank`, `crypto`, `brand`, `operator`, `country`, `card`,
  `hash_algo`) acceptées par l'assainisseur CRDT — aucune perte au chargement.
- Nouveaux tests unitaires (rapprochement d'information partagée, empilement des voies
  indépendant du tri). 240 tests au total.
