# Release notes — v1.7.1

> Texte prêt à coller dans la GitHub Release (section anglaise d'abord, française
> ensuite, comme les README).

---

## 🇬🇧 English

### ✏️ Draw your own link routes

The app no longer forces which side a link enters or leaves an entity.

- New **"Draw the route"** mode on any selected link (✏ button in the link toolbar,
  or right-click → *Draw the route*): pick the exact **exit side** on the source
  entity (top/bottom/left/right pills — or click the node for auto), **click the
  waypoints** of the path (live dashed preview, right-click removes the last point),
  then pick the **entry side** on the target entity. <kbd>Enter</kbd> = auto arrival,
  <kbd>Esc</kbd> = cancel (nothing written).
- The whole drawn route applies as **one undo step** (Ctrl+Z restores the previous
  route entirely).
- **Start / End side selectors** (Auto/Top/Bottom/Left/Right) are now directly in the
  link toolbar.
- Automatic routing remains the default; *Automatic route* resets any manual routing.

### 🔒 100% local mode (closed networks)

New **Settings → Network & privacy** panel with two explicit modes:

- **Standard (Internet)** — public signaling + STUN defaults (replaceable), optional
  GitHub update check.
- **100% local (self-hosted)** — the app contacts **only** the internal addresses you
  enter: internal signaling server(s), optional internal **STUN/TURN**
  (`stun:host:port` / `turn:host:port user password`), and **update checks are
  disabled** (zero GitHub contact — the main process only ever checks on explicit
  renderer authorization). Empty or invalid address → shared boards stay **offline**:
  no silent fallback to public servers, ever.
- Live **"What the app will contact"** recap computed by the *same function* that
  opens the real connections, ending with a clear verdict ("No public service will be
  contacted").
- Network settings now **apply immediately** to the currently open board (it
  reconnects with the new configuration), and the diagnostics panel flags any
  connection left over from a previous configuration.
- STUN servers are no longer hard-coded; custom STUN/TURN also works in standard mode.

### Under the hood

- New `setEdgeRouting` board operation (waypoints + both anchors in a single Yjs
  transaction).
- Settings store migrated to v5 (`networkMode`, `customIceServers`,
  `autoUpdateCheck`).
- 13 new unit tests (fail-closed guarantee of local mode, strict STUN/TURN parsing,
  one-transaction routing). 228 tests total.

---

## 🇫🇷 Français

### ✏️ Dessinez vous-même le tracé des liens

Le logiciel n'impose plus le côté par lequel un lien entre ou sort d'une entité.

- Nouveau mode **« Dessiner le tracé »** sur tout lien sélectionné (bouton ✏ de la
  barre du lien, ou clic droit → *Dessiner le tracé*) : choisissez le **côté de
  sortie** sur l'entité source (pastilles haut/bas/gauche/droite — ou cliquez le
  nœud pour l'auto), **cliquez les points** du trajet (aperçu pointillé en direct,
  clic droit retire le dernier point), puis le **côté d'entrée** sur l'entité cible.
  <kbd>Entrée</kbd> = arrivée auto, <kbd>Échap</kbd> = annuler (rien n'est écrit).
- Le tracé dessiné s'applique en **une seule étape d'annulation** (Ctrl+Z restaure
  l'ancien tracé en entier).
- Les sélecteurs **Départ / Arrivée** (Auto/Haut/Bas/Gauche/Droite) sont désormais
  directement dans la barre du lien.
- Le tracé automatique reste le défaut ; « Tracé automatique » efface tout routage
  manuel.

### 🔒 Mode 100 % local (réseaux fermés)

Nouveau panneau **Paramètres → Réseau & confidentialité** avec deux modes explicites :

- **Standard (Internet)** — serveurs publics par défaut (remplaçables), vérification
  de mise à jour GitHub optionnelle.
- **100 % local (auto-hébergé)** — l'application ne contacte **que** les adresses
  internes saisies : signalisation interne, **STUN/TURN** internes optionnels
  (`stun:hôte:port` / `turn:hôte:port utilisateur motdepasse`), et **mises à jour
  coupées** (zéro contact GitHub — le processus principal ne vérifie que sur
  autorisation explicite du renderer). Adresse vide ou invalide → les tableaux
  partagés restent **hors ligne** : jamais de repli silencieux vers les serveurs
  publics.
- Récapitulatif en direct **« Ce que l'application contactera »**, calculé par la
  *même fonction* que celle qui ouvre les connexions réelles, avec verdict clair
  (« Aucun service public ne sera contacté »).
- Les réglages réseau s'appliquent désormais **immédiatement** au tableau ouvert (il
  se reconnecte avec la nouvelle configuration), et le diagnostic signale toute
  connexion héritée d'une configuration précédente.
- Les serveurs STUN ne sont plus codés en dur ; les STUN/TURN personnalisés
  fonctionnent aussi en mode standard.

### Sous le capot

- Nouvelle opération `setEdgeRouting` (waypoints + deux ancres en une seule
  transaction Yjs).
- Store de paramètres migré en v5 (`networkMode`, `customIceServers`,
  `autoUpdateCheck`).
- 13 nouveaux tests unitaires (garantie de non-repli du mode local, parsing
  STUN/TURN strict, routage en une transaction). 228 tests au total.
