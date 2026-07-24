# Release notes — v1.8.8

> Texte prêt à coller dans la GitHub Release (section anglaise d'abord, française
> ensuite, comme les README).

---

## 🇬🇧 English

A release about **getting started and finding things**: a guided tutorial for newcomers,
settings finally split into tabs, a new app icon — plus a deployment guide written from an
actual closed-network rollout rather than from theory.

### 🎓 A guided tutorial, right on the home screen

A discreet **Tutorial** button now sits on the home screen. It offers a **twelve-step walk
through the essentials** — create a board, drop an entity, fill in its card, link two
entities, cite your sources, read the timeline, search, share, export.

What makes it useful: it **points at the real interface** while you work in it. A ring
highlights the actual button being described, the coach card places itself next to it, and
**nothing is blocked** — you click, drag and type for real as you read. It **auto-advances**
when you create your first board, tells you where to go if you wander off, and you can
**leave at any time**. Replay it whenever from **Settings → About**.

### 🗂️ Settings, finally sorted

The settings dialog was one long scrolling page where profile, theme, language, shortcuts,
network mode, ICE servers, token and update policy all ran together. It is now **five tabs**:
**Profile · Appearance · Shortcuts · Network · About**, each opening with one line saying
what it is for.

The footer stays shared — a single **Save** commits everything, whichever tab you are on —
and a validation error **jumps you back to the offending field** instead of failing silently.

### 🖼️ New app icon

A new logo ships across the installer, the taskbar, the window, the first-run screen and the
home screen.

### 🔄 Updates stay on in 100 % local mode

Switching to 100 % local mode used to silently disable update checks, leaving stations
stranded on old versions for months. Update checking is now **on by default** in local mode
too. GitHub Releases is then the **only** public service contacted — **no board data ever
passes through it**, it stays encrypted between computers — the *"What the app will contact"*
recap says so plainly, and **one checkbox turns it off** for genuinely air-gapped networks.

An explicit opt-out from an earlier version is preserved: only stations that never touched
the setting get the new default.

### 📘 A real deployment guide

[`docs/DEPLOIEMENT_LOCAL.fr.md`](DEPLOIEMENT_LOCAL.fr.md) (French) replaces the thin
self-hosting notes: systemd service, access token hygiene, firewall rules **including the
IPv6 hole everyone forgets**, organization branding, layered end-to-end verification,
one-click workstation provisioning, a symptom-to-cause troubleshooting table and day-to-day
operation. Field-tested on Ubuntu 24.04, with the traps called out where they bite —
unquoted `Environment=` values silently truncated by systemd, `iptables` rules lost at
reboot, Node 24 showing up as `MainThread`, `journalctl` lying without `sudo`.

### ✍️ Made by k0nrd

The home screen and the first-run screen now carry a **"made by k0nrd"** signature; clicking
the name opens the author's GitHub in your system browser.

### Under the hood

- The tutorial anchors to the interface through `data-tut` attributes; a test asserts that
  **every anchor a step declares actually exists in the UI code**, so a refactor can't leave
  the coach pointing at nothing.
- Tutorial state is deliberately **not** persisted beyond a "already seen" flag — an
  interrupted tour never reopens itself at launch.
- New tests also lock the three translation dictionaries to an **identical key set with no
  empty strings**, catching a silently dropped or duplicated key.
- The `.trace` format is **unchanged (v7)**, fully backward compatible; no data-model change.
- **288 tests total**, production build OK, Windows + Linux packaged.

---

## 🇫🇷 Français

Une version consacrée à la **prise en main et au rangement** : un tutoriel guidé pour les
débutants, des paramètres enfin découpés en onglets, une nouvelle icône — et un guide de
déploiement écrit depuis un vrai déploiement en réseau fermé, pas depuis la théorie.

### 🎓 Un tutoriel guidé, dès l'écran d'accueil

Un bouton **Tutoriel** discret prend place sur l'écran d'accueil. Il propose un **parcours en
douze étapes courtes** — créer un tableau, poser une entité, renseigner sa fiche, relier deux
entités, citer ses sources, lire la frise, rechercher, partager, exporter.

Ce qui le rend utile : il **désigne l'interface réelle** pendant que vous y travaillez. Un
repère entoure le bouton dont on parle, la fiche du coach se place à côté, et **rien n'est
bloqué** — vous cliquez, glissez et tapez pour de vrai en lisant. Il **avance seul** dès que
vous créez votre premier tableau, vous indique où revenir si vous vous égarez, et se **quitte
à tout moment**. Rejouable quand vous voulez depuis **Paramètres → À propos**.

### 🗂️ Des paramètres enfin rangés

Le dialogue des paramètres était une longue page à défilement où profil, thème, langue,
raccourcis, mode réseau, serveurs ICE, jeton et politique de mise à jour se succédaient pêle-
mêle. Il devient **cinq onglets** : **Profil · Apparence · Raccourcis · Réseau · À propos**,
chacun s'ouvrant sur une phrase qui dit à quoi il sert.

Le pied reste commun — un seul **Enregistrer** valide l'ensemble, quel que soit l'onglet — et
une erreur de saisie vous **ramène sur le champ fautif** au lieu d'échouer en silence.

### 🖼️ Nouvelle icône

Un nouveau logo, de l'installeur à la barre des tâches, de la fenêtre à la première ouverture
et à l'écran d'accueil.

### 🔄 Mises à jour maintenues en mode 100 % local

Basculer en 100 % local coupait silencieusement la vérification des mises à jour, laissant des
postes bloqués des mois sur une version ancienne. Elle est désormais **active par défaut** en
mode local aussi. GitHub Releases devient alors le **seul** service public contacté — **aucune
donnée de tableau n'y transite**, elle reste chiffrée entre postes — le récapitulatif « ce que
l'application contactera » le dit franchement, et **une case à décocher** suffit pour un réseau
réellement isolé.

Un refus explicite exprimé dans une version antérieure est conservé : seuls les postes qui
n'avaient jamais touché au réglage héritent du nouveau défaut.

### 📘 Un vrai guide de déploiement

[`docs/DEPLOIEMENT_LOCAL.fr.md`](DEPLOIEMENT_LOCAL.fr.md) remplace les quelques notes
d'auto-hébergement : service systemd, hygiène du jeton d'accès, règles de pare-feu **y compris
le trou IPv6 que tout le monde oublie**, marque d'organisation, vérification de bout en bout
couche par couche, provisionnement des postes en un clic, tableau symptôme → cause pour le
dépannage et exploitation courante. Éprouvé sur Ubuntu 24.04, avec les pièges signalés là où
ils mordent — valeurs `Environment=` sans guillemets tronquées en silence par systemd, règles
`iptables` perdues au redémarrage, Node 24 qui s'affiche en `MainThread`, `journalctl` qui
ment sans `sudo`.

### ✍️ Fait par k0nrd

L'écran d'accueil et la première ouverture portent désormais la signature **« fait par
k0nrd »** ; un clic sur le pseudo ouvre le GitHub de l'auteur dans le navigateur du système.

### Sous le capot

- Le tutoriel s'ancre à l'interface par des attributs `data-tut` ; un test vérifie que
  **chaque ancre déclarée par une étape existe réellement dans le code de l'interface**, pour
  qu'un remaniement ne laisse pas le coach désigner le vide.
- L'état du tutoriel n'est volontairement **pas** persisté au-delà d'un drapeau « déjà vu » :
  un parcours interrompu ne se rouvre jamais de lui-même au lancement.
- De nouveaux tests verrouillent aussi les trois dictionnaires de traduction sur un **jeu de
  clés identique et sans chaîne vide**, ce qui attrape une clé perdue ou dupliquée en silence.
- Le format `.trace` est **inchangé (v7)**, totalement rétro-compatible ; aucun changement de
  modèle de données.
- **288 tests au total**, build de production OK, packaging Windows + Linux.
