<p align="center">
  <img src="docs/assets/bannerpng.png" alt="COSINT — tableau d'enquête OSINT collaboratif" width="100%">
</p>

<p align="center">
  <a href="./README.md">English</a> · <b>Français</b> · <a href="./README.pl.md">Polski</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.9.1-06b6d4" alt="Version">
  <img src="https://img.shields.io/badge/licence-MIT-3fbf6a" alt="Licence">
  <img src="https://img.shields.io/badge/plateforme-Windows%20·%20Linux-8b5cf6" alt="Plateforme">
  <img src="https://img.shields.io/badge/tests-578%20au%20vert-3fbf6a" alt="Tests">
  <img src="https://img.shields.io/badge/télémétrie-aucune-ef4444" alt="Aucune télémétrie">
  <img src="https://img.shields.io/badge/Electron%20·%20React%20·%20Yjs-1f2937" alt="Construit avec">
</p>

<p align="center">
  <i>Cartographiez des entités, reliez-les, rattachez vos sources et construisez un dossier —<br>
  seul ou à plusieurs en temps réel, sans que vos données ne touchent jamais un serveur.</i>
</p>

---

## ✨ C'est quoi COSINT ?

**COSINT** est un **tableau d'enquête OSINT de bureau**. Posez des entités sur un canevas
(personnes, comptes, numéros, domaines, IP, wallets crypto, véhicules, événements, lieux…),
reliez-les, notez et rattachez vos sources, et regardez le dossier prendre forme — **seul ou
à plusieurs en temps réel**.

La particularité : **il n'y a aucun serveur.** Les pairs se synchronisent **en direct**,
chiffrés de bout en bout, et le contenu des tableaux n'atteint jamais aucun serveur — pas
même une copie chiffrée.

> 🌍 **Trilingue :** l'interface est disponible en **français, anglais et polonais**.
> Choisissez la langue au téléchargement/à l'installation (sélecteur de l'installeur) ou à
> tout moment dans **Paramètres → Apparence** ; par défaut, celle du système.

<table>
<tr>
<td width="50%" valign="top">

### 🔒 Confidentiel par conception
Aucun compte, aucun cloud, aucune télémétrie. Le contenu circule **de pair à pair** via
WebRTC, **chiffré de bout en bout (AES-GCM)**, avec une clé qui ne quitte jamais vos postes.

</td>
<td width="50%" valign="top">

### 🧭 Pensé pour l'enquête réelle
~90 types d'entités, sources graduées (échelle de l'Amirauté), badges de statut, liens
riches, deux frises, export CSV/PNG/`.trace`, types d'entité personnalisés par tableau.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🌐 À votre façon
En ligne en temps réel, **totalement hors ligne**, ou en mode **100 % local** qui ne
contacte *que* les serveurs internes configurés — avec la preuve en direct de ce qu'il joint.

</td>
<td width="50%" valign="top">

### 🧩 Aucun verrouillage
Tout est un fichier `.trace` (JSON) portable sur votre disque. Copiez nœuds, images et
sous-graphes entiers dans le presse-papiers et collez-les où vous voulez.

</td>
</tr>
</table>

---

## 🚀 Nouveautés de la 1.9.1

- **🎨 Interface refondue** — thème graphite neutre (sombre et clair), polices IBM Plex
  embarquées, accueil en liste avec barre latérale, barre d'outils ancrée en rail, recherche
  et annuler/rétablir dans la barre supérieure, barre d'état, sélecteur d'entité en deux
  volets, Légende et Sources ancrées.
- **🔧 Base à jour** — Electron 43, aucune vulnérabilité connue dans `npm audit`,
  intégration continue et builds de release automatisés (GitHub Actions).
- Les tableaux, le format `.trace` et le protocole pair-à-pair sont inchangés.

Notes complètes : [`docs/RELEASE_NOTES_v1.9.1.md`](docs/RELEASE_NOTES_v1.9.1.md).

## Nouveautés de la 1.9.0

- **🖼️ Une copie d'image qui marche vraiment sous Windows** — Ctrl+C sur une image pose
  **l'image elle-même** dans le presse-papiers, pour n'importe quelle autre application.
  Avant, le WebP stocké n'était pas lisible par le système et le presse-papiers était vidé
  puis verrouillé par les programmes qui le surveillent (historique du presse-papiers de
  Windows) : COSINT l'écrit maintenant une seule fois et vérifie. En plus : **clic droit ›
  Copier l'image / Enregistrer l'image sous**, **glisser une image hors du tableau** vers le
  bureau ou une autre application, et un recollage dans COSINT qui garde titre, étiquettes
  et taille.
- **🧷 Des images dans les entités** — une **galerie de 12 images au plus** par entité, la
  première servant de **couverture** sur le nœud (badge **+N**). Ajout depuis le panneau
  Détails, le clic droit, la barre d'outils du nœud ou en **déposant des images sur
  l'entité** ; visionneuse, choix de la couverture, réordonnancement, copie, enregistrement.
- **📄 Aperçu des documents** — un PDF montre sa **première page et son nombre de pages** et
  s'ouvre dans une **visionneuse** (pages, zoom) ; **Word / Excel / PowerPoint** (docx, xlsx,
  pptx — anciens doc, xls, ppt au mieux), **LibreOffice / OpenOffice** (odt, ods, odp, odg)
  et **RTF** montrent leur contenu, les fichiers **Apple iWork** leur miniature ; l'**audio**
  (mp3, wav, ogg, flac, m4a…) a un lecteur avec ses tags, la **vidéo** (mp4, webm…) se lit
  dans la visionneuse ; le **code et les scripts** (.bat, .ps1, .sh, .py…) sont colorés et
  **jamais exécutés** ; un fichier texte affiche un extrait ; les autres fichiers une carte
  propre. Calculé localement, rien de plus n'est synchronisé.
- **🔗 Préréglages de lien complets** — un préréglage reprend **chaque réglage d'un lien**
  (relation, y compris le texte libre *« Autre »*, libellé, couleur, épaisseur, tirets,
  flèches, tracé, statut, côtés d'ancrage). Gestion dans les Paramètres avec aperçu en
  direct, application ou enregistrement depuis la barre d'outils du lien, application à
  plusieurs liens d'un coup, et choix juste après avoir relié deux entités.
- **📎 Et aussi** — import de **n'importe quel fichier** (bouton Enregistrer, 25 Mo par
  fichier), une **barre d'outils que l'on place soi-même** (gauche/droite/haut/bas), une
  **icône par entité**, des **champs d'entité multi-lignes**.

Notes complètes : [`docs/RELEASE_NOTES_v1.9.0.md`](docs/RELEASE_NOTES_v1.9.0.md).

<details>
<summary>1.8.9 — découverte automatique du serveur en DHCP, tutoriel qui explique le modèle</summary>

- **📡 Votre serveur en DHCP, retrouvé tout seul** — un serveur auto-hébergé dont l'adresse
  changeait dans la nuit, c'était refaire un profil et le réimporter sur chaque poste, tous
  les matins. Désormais chaque poste vérifie l'adresse enregistrée au démarrage et, si elle
  ne répond plus, **retrouve le serveur seul sur le réseau local**. Il le reconnaît à une
  **empreinte dérivée de votre jeton d'accès** : impossible de tomber sur un autre serveur
  que le vôtre, et **votre jeton n'est jamais transmis avant que ce serveur soit identifié**.
  Seul le port configuré est sondé, seulement sur vos sous-réseaux privés. Nécessite un
  serveur en 1.8.9.
- **🎓 Le tutoriel explique aussi le fonctionnement** — quatre étapes de plus que la simple
  mécanique : qualifier ce que l'on sait (à vérifier / confirmé / écarté), qui peut faire
  quoi (rôles et limite de participants), où passent réellement vos données (pair-à-pair,
  chiffré de bout en bout, ce qu'un serveur voit et ne voit pas), et le travail hors ligne
  avec le `.trace` comme sauvegarde.

Notes complètes : [`docs/RELEASE_NOTES_v1.8.9.md`](docs/RELEASE_NOTES_v1.8.9.md).

</details>

<details>
<summary>1.8.8 — tutoriel guidé, paramètres en onglets, nouvelle icône</summary>

- **🎓 Un tutoriel guidé, dès l'écran d'accueil** — un bouton *Tutoriel* discret fait
  découvrir l'essentiel en **désignant la vraie interface** pendant que vous la manipulez.
- **🗂️ Des paramètres enfin rangés** — la page unique à rallonge devient **cinq onglets**
  (Profil, Apparence, Raccourcis, Réseau, À propos).
- **🖼️ Nouvelle icône** — un logo repensé, de l'installeur à l'écran d'accueil.
- **🔄 Mises à jour maintenues en mode 100 % local**, avec une case à décocher pour un
  réseau réellement isolé.
- **📘 Un vrai guide de déploiement, dans les trois langues** — [`docs/DEPLOY_LOCAL.fr.md`](docs/DEPLOY_LOCAL.fr.md).
- **✍️ Fait par k0nrd** — l'écran d'accueil dit désormais qui l'a écrit, à un clic des sources.

Notes complètes : [`docs/RELEASE_NOTES_v1.8.8.md`](docs/RELEASE_NOTES_v1.8.8.md).

</details>

---

## ⚡ Fonctionnalités

**Canevas d'enquête**
- ~90 types d'entités en taxonomie (personne, société, pseudo, e-mail, téléphone, domaine,
  IP, wallet crypto, véhicule, **événement**, lieu…) avec gabarits de champs.
- **Modules dédiés (1.8.1)** — catalogues cherchables pour banques, cryptos, marques,
  opérateurs, pays, réseaux de carte, algorithmes de hachage ; toujours une valeur libre *« Autre »*.
- **Types d'entité personnalisés par tableau** — définissez les vôtres (nom, icône, couleur,
  gabarit) ; synchronisés avec tous les pairs et inclus dans l'export `.trace`.
- **Datation d'événement** — une date/heure exacte, une fourchette *au plus tôt → au plus tard*,
  ou une durée précise *de → à*.
- Notes (markdown), notes horodatées, images, blocs de code colorés, cartes de lien,
  zones de regroupement.
- **Images dans les entités (1.9)** — une galerie par entité avec couverture sur le nœud,
  une visionneuse, copier / enregistrer / glisser l'image vers toute autre application.
- **Fichiers avec aperçu (1.9)** — import de n'importe quel fichier ; un PDF montre sa
  première page et s'ouvre dans une visionneuse paginée avec zoom ; documents bureautiques
  (Word, Excel, PowerPoint, LibreOffice, RTF), audio avec lecteur, vidéo, code coloré (jamais
  exécuté) et extraits de texte — calculé localement, lecteurs bornés.
- Sources graduées sur l'**échelle de l'Amirauté** (fiabilité A–F / crédibilité 1–6),
  rattachables à tout élément, avec un rapport de sources en Markdown.
- Badges de statut, tags, couleurs libres, recherche plein texte insensible aux accents,
  filtres, légende, mini-carte, et **deux frises que l'on parcourt** — quand les éléments
  ont été *ajoutés*, et quand les événements se sont *déroulés*.
- Import CSV (détection intelligente des colonnes), export CSV (par colonne), export PNG du
  tableau entier, `.trace` JSON portable.

**Des liens que vous maîtrisez**
- Types de relation, libellés libres, flèches, couleur/épaisseur/style, courbe/droit/coudé.
- Mode **« Dessiner le tracé »** : choisissez le côté de sortie sur A, cliquez les points,
  choisissez le côté d'entrée sur B — aperçu en direct, une seule annulation, tracé
  automatique par défaut.
- **Préréglages de lien (1.9)** — enregistrez n'importe quelle combinaison de réglages sous
  un nom, appliquez-la à un ou plusieurs liens, ou choisissez-la juste après avoir relié
  deux entités.

**Collaboration temps réel (P2P)**
- Partage par **code de 12 caractères** (60 bits d'entropie). Les arrivants passent par un
  **salon d'attente** et sont admis par un membre en ligne (ouvert / approbation / privé).
- Rôles (admin / éditeur / visiteur), limite de participants (2–10), révocation & rotation du code.
- Présence : curseurs, sélections, avatars, disponibilité.

---

## 🛡️ Modèle de sécurité

| Quoi | Par où | Un tiers voit le contenu ? |
|---|---|---|
| Contenu du tableau (entités, liens, images, fichiers…) | **Direct pair ↔ pair** (WebRTC, AES-GCM E2E) | Jamais — ne touche aucun serveur |
| Mise en relation (handshake chiffré) | Serveur de signalisation (public par défaut, auto-hébergeable) | Non — salon opaque + blobs chiffrés |
| Découverte de l'IP publique | STUN (Google/Cloudflare/Twilio par défaut, remplaçables) | Aucune donnée |
| Relais des données (TURN) | **N'existe pas** par conception | — |
| Vérification de mise à jour | GitHub Releases (optionnelle, une case — seul service public joignable en mode local) | — |

- Code de partage → identifiant de salon + clé sont dérivés **localement** (HKDF-SHA-256,
  contextes séparés) ; le code lui-même n'est jamais transmis.
- Les tableaux sont chiffrés par un **secret de session aléatoire** *non dérivable du code*,
  scellé à chaque membre approuvé (ECDH P-256 → AES-GCM).
- Détails complets : [GUIDE.fr.md](./GUIDE.fr.md) · [DECISIONS.md](./DECISIONS.md).

### Mode 100 % local (réseaux fermés)

**Paramètres → Réseau** ne contacte **que** les adresses internes saisies — votre serveur de
signalisation, STUN/TURN internes optionnels. Adresse vide ou invalide → les tableaux
partagés restent **hors ligne**, *sans aucun repli silencieux* vers les serveurs publics. Un
récapitulatif en direct *« Ce que l'application contactera »*, calculé par la même fonction
que celle qui ouvre les vraies connexions, le prouve.

Depuis la **1.8.8**, la vérification de mise à jour reste **active** en mode local pour
qu'un poste ne s'enlise pas sur une version ancienne — GitHub Releases est alors le *seul*
service public contacté, aucune donnée de tableau n'y transite, et **décocher une case**
restaure une configuration entièrement close.

---

## 📥 Téléchargement & installation

Récupérez la dernière version dans **[Releases](../../releases)** :

| Fichier | Usage |
|---|---|
| `COSINT-Setup-x.y.z.exe` | Installeur Windows (menu Démarrer, désinstalleur, auto-update) |
| `COSINT-Portable-x.y.z.exe` | Windows portable — aucune installation |
| `COSINT-x.y.z-x86_64.AppImage` | Linux portable |
| `COSINT-x.y.z-amd64.deb` | Paquet Debian/Ubuntu |

### Lancer ce que vous avez téléchargé

**Windows**
- **Installeur** — lancez `COSINT-Setup-x.y.z.exe`, **choisissez votre langue** (français /
  anglais / polonais), choisissez un dossier, puis démarrez COSINT depuis le menu Démarrer
  (ou le raccourci bureau). Les mises à jour s'installent ensuite toutes seules.
- **Portable** — double-cliquez simplement `COSINT-Portable-x.y.z.exe` ; rien n'est installé.
- Pas encore signé : SmartScreen peut afficher *« Windows a protégé votre PC »* →
  **Informations complémentaires** → **Exécuter quand même** (au premier lancement).

**Linux**
- **AppImage** (portable, sans installation) — rendez-le exécutable, puis lancez-le :
  ```bash
  chmod +x COSINT-x.y.z-x86_64.AppImage
  ./COSINT-x.y.z-x86_64.AppImage
  ```
  En cas d'erreur `libfuse.so.2`, installez FUSE (`sudo apt install libfuse2`) ou lancez-le
  avec `--appimage-extract-and-run`.
- **Debian/Ubuntu** — installez avec apt (il tire les dépendances), puis lancez depuis le
  menu Applications ou la commande `cosint` :
  ```bash
  sudo apt install ./COSINT-x.y.z-amd64.deb
  cosint
  ```
  Pour désinstaller plus tard : `sudo apt remove cosint`.

Vos données (tableaux, profil) vivent dans `%APPDATA%/COSINT` sous Windows et
`~/.config/COSINT` sous Linux — elles survivent aux mises à jour comme aux réinstallations.

## 🖧 Auto-héberger la signalisation

Le seul serveur dont vous pouvez avoir besoin est un relais WebSocket d'environ 140 lignes
([`server/`](./server/README.md)) qui présente les pairs entre eux — il ne peut rien lire.
Node 18+ :

```bash
cd server
npm install
PORT=4444 npm start        # → ws://votre-machine:4444
```

**Déploiement sur un réseau fermé ?** Suivez le guide complet, pas à pas :
[`docs/DEPLOY_LOCAL.fr.md`](docs/DEPLOY_LOCAL.fr.md) — service systemd, jeton
d'accès, règles de pare-feu **y compris IPv6**, marque d'organisation, vérification de bout
en bout, provisionnement des postes en un clic (`.cosint-org`), dépannage et exploitation
courante. Testé sur Ubuntu 24.04. Également en
[anglais](docs/DEPLOY_LOCAL.md) et en [polonais](docs/DEPLOY_LOCAL.pl.md).

## 🛠️ Compiler depuis les sources

Prérequis : Node.js ≥ 22.12, npm.

```bash
npm install
npm run dev          # développement (rechargement à chaud)
npm run typecheck    # vérifications TypeScript
npm test             # tests unitaires + intégration P2P (vitest)
npm run build:win    # installeur + portable Windows → release/
npm run build:linux  # AppImage + .deb → release/
```

## 🧱 Pile technique

[Electron](https://www.electronjs.org/) · [React](https://react.dev/) ·
[React Flow](https://reactflow.dev/) · [Yjs](https://yjs.dev/) (CRDT) ·
[y-webrtc](https://github.com/yjs/y-webrtc) · y-indexeddb · Zustand · Vite · Vitest

## 🤝 Contribuer

Issues et PR bienvenues — l'interface est livrée en **français, anglais et polonais**
(`src/renderer/src/i18n/`) ; **une relecture des chaînes anglaises/polonaises** et de
**nouveaux dictionnaires de langue**, des traductions de la documentation et des retours
d'enquêtes réelles sont les bienvenus. Les décisions d'architecture sont consignées dans
[DECISIONS.md](./DECISIONS.md).

## 📄 Licence

[MIT](./LICENSE)
