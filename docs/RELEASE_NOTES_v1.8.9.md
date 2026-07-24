# Release notes — v1.8.9

> Texte prêt à coller dans la GitHub Release (section anglaise d'abord, française
> ensuite, comme les README).

---

## 🇬🇧 English

**If you self-host a signaling server on DHCP, this release is for you.** Its address used to
change overnight and every workstation had to be reconfigured by hand, every morning. Now they
find it again on their own.

### 📡 Your DHCP server, found automatically

A signaling server on DHCP moves — often nightly. Until now that meant reading the new
address, rebuilding a `.cosint-org` profile and re-importing it on every station. Daily.

From 1.8.9, each station **checks its saved address at startup** (one small request) and, if
it no longer answers, **sweeps its own local network to find the server again**, rewrites the
address and reconnects. A message says what happened — it is never silent.

**How it knows it found the right server.** The server publishes an **identity fingerprint**
on `GET /cosint`: a truncated `sha256("cosint-discovery-v1:" + COSINT_TOKEN)`. Each station
derives the same fingerprint from the token it already holds and accepts **only** an exact
match. This matters because:

- the fingerprint **proves knowledge of the token without revealing it** — and the token this
  project's guide generates is 24 random bytes, so it cannot be brute-forced;
- **the token is never sent before the right server has been identified**, so a rogue server
  planted on the same network can neither impersonate yours nor be handed your token;
- **nothing else is exposed** — not the organization name, not the logo, not the rooms.
  Branding stays behind the token check, exactly as in 1.8.7.

**What gets probed, and nothing else:** the **private** ranges of the station's own interfaces
(at most one /24 per interface, 3 interfaces), on the **single port** already configured.
Never a public range, never another port. Off the network, no fingerprint matches, nothing
moves — the station simply stays offline, which is the correct behaviour.

Settings → Network → *Server discovery*: on by default, with a **Search** button to force a
lookup. **Without a token the fingerprint is a constant**, so any open COSINT server on the
network matches — discovery becomes a convenience rather than a guarantee, and the hint says
so. One more reason to set a token.

> **Update your server** (`git pull` + restart) — an older server does not answer on
> `/cosint` and discovery silently finds nothing.

### 🎓 The tutorial now explains how it works

Beyond the mechanics, four steps on the things that actually matter:

- **Qualify what you know** — to check / confirmed / ruled out, and why that discipline is
  what separates an investigation from a pile of screenshots;
- **Who can do what** — admin, editor, visitor; participant limits; code rotation and removal;
- **Where your data goes** — peer to peer, end-to-end encrypted, and precisely what a
  signaling server can and cannot see;
- **Offline, and yours** — everything saved locally as you go, syncing resumes by itself, and
  `.trace` is your backup because nobody else holds a copy.

### Under the hood

- Discovery runs in the **main process**: the production CSP (`connect-src 'self' ws: wss:`)
  forbids the renderer from making HTTP requests at all, and that stays true.
- A test starts a **real HTTP server** and drives the actual probe through it, so the two
  halves of the protocol are verified against each other rather than mocked. Another asserts
  the renderer's fingerprint equals an independent Node reimplementation of the server's.
- Address rewriting only ever replaces the **host**: scheme, port and path survive, so a
  reverse-proxy deployment keeps working.
- The `.trace` format is **unchanged (v7)**, fully backward compatible.
- **306 tests total**, production build OK.

---

## 🇫🇷 Français

**Si vous auto-hébergez un serveur de signalisation en DHCP, cette version est pour vous.**
Son adresse changeait dans la nuit et chaque poste devait être reconfiguré à la main, tous les
matins. Ils le retrouvent désormais tout seuls.

### 📡 Votre serveur en DHCP, retrouvé tout seul

Un serveur de signalisation en DHCP change d'adresse — souvent chaque nuit. Jusqu'ici, il
fallait relever la nouvelle adresse, refaire un profil `.cosint-org` et le réimporter sur
chaque poste. Quotidiennement.

Depuis la 1.8.9, chaque poste **vérifie l'adresse enregistrée au démarrage** (une petite
requête) et, si elle ne répond plus, **balaie son réseau local pour retrouver le serveur**,
réécrit l'adresse et se reconnecte. Un message dit ce qui s'est passé — jamais en silence.

**Comment il sait qu'il a trouvé le bon serveur.** Le serveur publie une **empreinte
d'identité** sur `GET /cosint` : un `sha256("cosint-discovery-v1:" + COSINT_TOKEN)` tronqué.
Chaque poste dérive la même empreinte depuis le jeton qu'il détient déjà et n'accepte **que**
la correspondance exacte. C'est important parce que :

- l'empreinte **prouve la connaissance du jeton sans le révéler** — et le jeton que génère le
  guide du projet fait 24 octets aléatoires, donc non brute-forçable ;
- **le jeton n'est jamais transmis avant que le bon serveur soit identifié** : un serveur
  pirate posé sur le même réseau ne peut ni usurper le vôtre, ni se faire livrer votre jeton ;
- **rien d'autre n'est exposé** — ni le nom d'organisation, ni le logo, ni les rooms. La
  marque reste derrière le contrôle de jeton, exactement comme en 1.8.7.

**Ce qui est sondé, et rien d'autre :** les plages **privées** des interfaces du poste
lui-même (au plus un /24 par interface, 3 interfaces), sur le **seul port** déjà configuré.
Jamais une plage publique, jamais un autre port. Hors du réseau, aucune empreinte ne
correspond, rien ne bouge — le poste reste simplement hors ligne, ce qui est le comportement
correct.

Paramètres → Réseau → *Découverte du serveur* : actif par défaut, avec un bouton
**Rechercher** pour forcer une recherche. **Sans jeton, l'empreinte est une constante** :
n'importe quel serveur COSINT ouvert du réseau correspond — la découverte devient une
commodité plutôt qu'une garantie, et l'aide le dit. Une raison de plus de définir un jeton.

> **Mettez votre serveur à jour** (`git pull` + redémarrage) — un serveur antérieur ne répond
> pas sur `/cosint` et la découverte ne trouve rien, silencieusement.

### 🎓 Le tutoriel explique aussi le fonctionnement

Au-delà de la mécanique, quatre étapes sur ce qui compte vraiment :

- **Qualifier ce que l'on sait** — à vérifier / confirmé / écarté, et pourquoi cette
  discipline distingue une enquête d'un tas de captures d'écran ;
- **Qui peut faire quoi** — admin, éditeur, visiteur ; limite de participants ; rotation du
  code et exclusion ;
- **Où passent vos données** — de pair à pair, chiffré de bout en bout, et précisément ce
  qu'un serveur de signalisation voit et ne voit pas ;
- **Hors ligne, et à vous** — tout est enregistré localement au fil de l'eau, la
  synchronisation reprend d'elle-même, et le `.trace` est votre sauvegarde puisque personne
  d'autre n'en détient de copie.

### Sous le capot

- La découverte s'exécute dans le **processus principal** : la CSP de production
  (`connect-src 'self' ws: wss:`) interdit toute requête HTTP au renderer, et ça le reste.
- Un test démarre un **vrai serveur HTTP** et y fait passer la sonde réelle : les deux moitiés
  du protocole sont donc vérifiées l'une contre l'autre, pas simulées. Un autre vérifie que
  l'empreinte du renderer égale une réimplémentation Node indépendante de celle du serveur.
- La réécriture d'adresse ne remplace jamais que l'**hôte** : schéma, port et chemin
  survivent, donc un déploiement derrière reverse-proxy continue de fonctionner.
- Le format `.trace` est **inchangé (v7)**, totalement rétro-compatible.
- **306 tests au total**, build de production OK.
