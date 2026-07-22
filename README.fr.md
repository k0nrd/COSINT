<p align="center">
  <img src="docs/assets/bannerpng.png" alt="COSINT — tableau d'enquête OSINT collaboratif" width="100%">
</p>

<p align="center">
  <a href="./README.md">English</a> · <b>Français</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.8.5-06b6d4" alt="Version">
  <img src="https://img.shields.io/badge/licence-MIT-3fbf6a" alt="Licence">
  <img src="https://img.shields.io/badge/plateforme-Windows%20·%20Linux-8b5cf6" alt="Plateforme">
  <img src="https://img.shields.io/badge/tests-251%20au%20vert-3fbf6a" alt="Tests">
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

## 🚀 Nouveautés de la 1.8.5

- **🎚️ Navigateur de zoom neutre** — la barre d'élargissement du bas est désormais **grise**
  (foncée en mode sombre, claire en mode clair) au lieu de bleue : elle ne paraît plus
  sélectionnée en permanence.
- **🏷️ Étiquettes d'événement épurées** — suppression du liseré coloré à gauche des cartes
  (la couleur figure déjà sur la barre de plage). Une date précise conserve un fin repère
  de position coloré.
- **🎨 Barres d'incertitude colorées** — les fourchettes hachurées prennent la **couleur de
  l'événement** (un événement rouge → hachures rouges) au lieu du gris systématique.
- **🐧 Builds Linux** — AppImage + `.deb` accompagnent désormais l'installeur/portable Windows.

Notes complètes : [`docs/RELEASE_NOTES_v1.8.5.md`](docs/RELEASE_NOTES_v1.8.5.md).

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

**Collaboration temps réel (P2P)**
- Partage par **code de 12 caractères** (60 bits d'entropie). Les arrivants passent par un
  **salon d'attente** et sont admis par un membre en ligne (ouvert / approbation / privé).
- Rôles (admin / éditeur / visiteur), limite de participants (2–10), révocation & rotation du code.
- Présence : curseurs, sélections, avatars, disponibilité.

---

## 🛡️ Modèle de sécurité

| Quoi | Par où | Un tiers voit le contenu ? |
|---|---|---|
| Contenu du tableau (entités, liens, images…) | **Direct pair ↔ pair** (WebRTC, AES-GCM E2E) | Jamais — ne touche aucun serveur |
| Mise en relation (handshake chiffré) | Serveur de signalisation (public par défaut, auto-hébergeable) | Non — salon opaque + blobs chiffrés |
| Découverte de l'IP publique | STUN (Google/Cloudflare/Twilio par défaut, remplaçables) | Aucune donnée |
| Relais des données (TURN) | **N'existe pas** par conception | — |
| Vérification de mise à jour | GitHub Releases (optionnelle, coupée en mode local) | — |

- Code de partage → identifiant de salon + clé sont dérivés **localement** (HKDF-SHA-256,
  contextes séparés) ; le code lui-même n'est jamais transmis.
- Les tableaux sont chiffrés par un **secret de session aléatoire** *non dérivable du code*,
  scellé à chaque membre approuvé (ECDH P-256 → AES-GCM).
- Détails complets : [GUIDE.fr.md](./GUIDE.fr.md) · [DECISIONS.md](./DECISIONS.md).

### Mode 100 % local (réseaux fermés)

**Paramètres → Réseau & confidentialité** ne contacte **que** les adresses internes saisies —
votre serveur de signalisation, STUN/TURN internes optionnels — avec **mises à jour coupées**.
Adresse vide ou invalide → les tableaux partagés restent **hors ligne**, *sans aucun repli
silencieux* vers les serveurs publics. Un récapitulatif en direct *« Ce que l'application
contactera »*, calculé par la même fonction que celle qui ouvre les vraies connexions, le prouve.

---

## 📥 Téléchargement & installation

Récupérez la dernière version dans **[Releases](../../releases)** :

| Fichier | Usage |
|---|---|
| `COSINT-Setup-x.y.z.exe` | Installeur Windows (menu Démarrer, désinstalleur, auto-update) |
| `COSINT-Portable-x.y.z.exe` | Windows portable — aucune installation |
| `COSINT-x.y.z-x86_64.AppImage` | Linux portable |
| `COSINT-x.y.z-amd64.deb` | Paquet Debian/Ubuntu |

> **Note SmartScreen :** les binaires ne sont pas encore signés. Au premier lancement,
> Windows peut afficher *« Windows a protégé votre PC »* → **Informations complémentaires**
> → **Exécuter quand même**.

Vos données (tableaux, profil) vivent dans `%APPDATA%/COSINT` et survivent aux mises à jour
comme aux réinstallations.

## 🖧 Auto-héberger la signalisation

Le seul serveur dont vous pouvez avoir besoin est un relais WebSocket d'environ 140 lignes
([`server/`](./server/README.md)) qui présente les pairs entre eux — il ne peut rien lire.
Node 18+ :

```bash
cd server
npm install
PORT=4444 npm start        # → ws://votre-machine:4444
```

## 🛠️ Compiler depuis les sources

Prérequis : Node.js ≥ 18, npm.

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

Issues et PR bienvenues — en particulier un **dictionnaire d'interface anglais**
(`src/renderer/src/i18n/`), des traductions de la documentation et des retours d'enquêtes
réelles. Les décisions d'architecture sont consignées dans [DECISIONS.md](./DECISIONS.md).

## 📄 Licence

[MIT](./LICENSE)
