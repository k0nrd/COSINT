<p align="center">
  <a href="./DEPLOY_LOCAL.md">English</a> · <b>Français</b> · <a href="./DEPLOY_LOCAL.pl.md">Polski</a>
</p>

# Déployer COSINT en mode 100 % local

Guide d'installation d'un serveur de signalisation COSINT sur un réseau fermé, et de
provisionnement des postes clients.

Testé sur **Ubuntu 24.04 LTS** avec **COSINT v1.8.9**. Adaptable à toute distribution
disposant de systemd.

### Valeurs à remplacer

Les commandes de ce guide utilisent des marqueurs à substituer par vos propres valeurs :

| Marqueur | Signification | Exemple |
| --- | --- | --- |
| `<IP_SERVEUR>` | Adresse du serveur de signalisation | `10.0.0.20` |
| `<SOUS_RESEAU>/24` | Plage autorisée à joindre le serveur | `10.0.0.0/24` |
| `<INTERFACE>` | Interface réseau reliée aux postes | `eth0`, `enp3s0` |
| `<UTILISATEUR>` | Compte d'exécution du service | `cosint` |
| `<PORT>` | Port d'écoute (`4444` par défaut dans ce guide) | `4444` |

Les noms d'organisation, sous-titres et couleurs des exemples sont également à adapter.

---

## Sommaire

1. [Ce que vous installez (et ce que vous n'installez pas)](#1-ce-que-vous-installez)
2. [Prérequis et préparation réseau](#2-prérequis-et-préparation-réseau)
3. [Installation du serveur](#3-installation-du-serveur)
4. [Jeton d'accès](#4-jeton-daccès)
5. [Service systemd](#5-service-systemd)
6. [Marque d'organisation](#6-marque-dorganisation)
7. [Pare-feu](#7-pare-feu)
8. [Vérification de bout en bout](#8-vérification-de-bout-en-bout)
9. [Provisionnement des postes](#9-provisionnement-des-postes)
10. [Dépannage](#10-dépannage)
11. [Exploitation courante](#11-exploitation-courante)

---

## 1. Ce que vous installez

Le serveur de signalisation est un **relais WebSocket d'environ 140 lignes**, avec une
seule dépendance (`ws`). Son rôle se limite à mettre les pairs en relation.

| Élément | Transite par le serveur ? |
| --- | --- |
| Contenu des tableaux (entités, liens, images) | **Non** — directement pair à pair, chiffré AES-GCM |
| Pseudos, codes de partage, secrets de session | **Non** |
| Identifiants de room | Oui, mais dérivés par HKDF — non réversibles |
| Messages de mise en relation | Oui, chiffrés |

Conséquence pratique : **compromettre le serveur ne donne accès à aucune enquête.** Le
contrôle d'accès décrit plus bas sert à empêcher l'usage du relais par des tiers et à
réduire la surface d'attaque, pas à protéger les données — elles le sont déjà par
cryptographie.

> **Ce n'est pas une base de données.** Aucun tableau n'est stocké côté serveur. Les
> données vivent dans `~/.config/COSINT` (Linux) ou `%APPDATA%/COSINT` (Windows) sur
> chaque poste, et dans les fichiers `.trace` exportés. Le serveur ne sauvegarde rien :
> prévoyez votre politique de sauvegarde côté postes.

---

## 2. Prérequis et préparation réseau

- Node.js **18 ou supérieur** (testé en v24)
- Un accès `sudo` sur la machine serveur
- Les postes et le serveur sur le **même sous-réseau**, ou routés entre eux

### Relever l'adresse du serveur

```bash
ip -4 a | grep inet
```

Notez l'IP de l'interface reliée au réseau des postes (`<INTERFACE>`, `eth0`…).

### Figer l'adresse — ou laisser COSINT s'en charger

Si la sortie précédente mentionne `dynamic`, l'adresse vient du DHCP et **peut changer**.

> **✅ Depuis la v1.8.9, ce n'est plus bloquant.** Chaque poste vérifie l'adresse
> enregistrée au démarrage et, si elle ne répond plus, **retrouve le serveur tout seul**
> sur le réseau local — voir [§ Découverte automatique](#découverte-automatique-serveur-en-dhcp).
> Plus besoin de refaire un profil chaque matin.

Figer l'adresse reste **préférable** (reconnexion instantanée, pas de balayage, profil
`.cosint-org` valable indéfiniment). Deux options, par ordre de préférence :

1. **Réservation DHCP sur la box ou le serveur DHCP** (recommandé) — associez l'adresse
   MAC de l'interface à l'IP voulue. Relevez la MAC avec :
   ```bash
   cat /sys/class/net/<INTERFACE>/address
   ```
2. **Adresse statique** configurée sur la machine (Netplan, NetworkManager).

> **Filaire plutôt que Wi-Fi.** Un serveur de signalisation temps réel gagne à être en
> Ethernet : latence plus stable, pas de reconnexion intempestive, pas d'isolation de
> clients Wi-Fi à contourner.

---

## 3. Installation du serveur

```bash
sudo apt update
sudo apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

Récupération du code et des dépendances :

```bash
sudo git clone https://github.com/k0nrd/COSINT.git /opt/cosint
cd /opt/cosint/server
sudo npm install --omit=dev
```

### Choisir le compte d'exécution

Deux approches, à trancher maintenant car elle conditionne les droits sur `/opt/cosint`.

**Compte système dédié (recommandé en production)** — limite les dégâts si le service est
compromis : pas de shell, pas de `sudo`, pas d'accès aux fichiers personnels.

```bash
sudo useradd -r -s /usr/sbin/nologin cosint
sudo chown -R cosint:cosint /opt/cosint
```

**Compte utilisateur existant** — plus simple à administrer (édition des fichiers, `scp`
sans `sudo`). Acceptable sur un relais exposé au seul LAN interne.

```bash
sudo chown -R <UTILISATEUR>:<UTILISATEUR> /opt/cosint
```

Retenez le nom choisi, il servira au champ `User=` du service.

---

## 4. Jeton d'accès

Sans jeton, n'importe quelle machine capable d'atteindre le port peut utiliser votre
relais. Avec `COSINT_TOKEN`, le serveur **refuse la connexion dès la poignée de main**,
avant même l'ouverture de la WebSocket : réponse HTTP 401, comparaison à temps constant.
Un poste sans le bon jeton ne voit rien, pas même la marque d'organisation.

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

### Hygiène du jeton

- **Ne le collez jamais** dans un ticket, un chat, un e-mail ou une capture d'écran. S'il
  a fuité, considérez-le comme brûlé et régénérez-le.
- Évitez qu'il traîne dans l'historique shell : préfixez les commandes qui le contiennent
  d'un **espace** (avec `HISTCONTROL=ignorespace` sous bash, actif par défaut sous zsh
  avec `setopt HIST_IGNORE_SPACE`).
- Le jeton part en paramètre `?token=` de l'URL. En `ws://` il circule **en clair** :
  acceptable sur un LAN maîtrisé, à proscrire dès que le réseau ne l'est plus
  (voir [TLS](#si-le-réseau-nest-pas-de-confiance--tls)).

---

## 5. Service systemd

Lancer le serveur à la main convient pour un test, mais le processus meurt à la fermeture
de la session SSH. Passez par systemd dès que le test est concluant.

```bash
sudo tee /etc/systemd/system/cosint-signaling.service > /dev/null <<'EOF'
[Unit]
Description=COSINT signaling server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=cosint
WorkingDirectory=/opt/cosint/server
Environment=PORT=4444
Environment=COSINT_TOKEN=A_REMPLACER
ExecStart=/usr/bin/node signaling.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo chmod 600 /etc/systemd/system/cosint-signaling.service
sudo nano /etc/systemd/system/cosint-signaling.service   # coller le vrai jeton
sudo systemctl daemon-reload
sudo systemctl enable --now cosint-signaling
```

Le `chmod 600` **avant** d'écrire le jeton évite qu'il soit lisible par tous, ne serait-ce
qu'un instant.

### ⚠️ Piège : les valeurs contenant des espaces

systemd découpe la ligne `Environment=` sur les espaces. Sans guillemets, une valeur en
plusieurs mots est tronquée et le reste devient une affectation invalide, **silencieusement
ignorée** :

```ini
# ✘ FAUX — donne « Section » et deux erreurs dans le journal
Environment=COSINT_ORG_NAME=Votre Organisation

# ✔ CORRECT — les guillemets encadrent la paire CLE=valeur entière
Environment="COSINT_ORG_NAME=Votre Organisation"
```

Les apostrophes à l'intérieur ne posent aucun problème. Après chaque modification :

```bash
sudo systemctl daemon-reload
sudo systemctl restart cosint-signaling
sudo journalctl -u cosint-signaling -n 10 --no-pager
```

Toute ligne `Invalid syntax, ignoring:` ou `Invalid environment assignment` signale une
variable perdue.

### Vérifier que le service tourne

```bash
sudo systemctl status cosint-signaling
sudo ss -tlnp | grep 4444
```

> **Ne vous fiez pas au nom du processus.** Node 24 renomme son thread principal en
> `MainThread` : `ss` et `systemctl` afficheront `MainThread` et non `node`. Ce n'est pas
> un autre programme. Pour lever le doute :
> ```bash
> ps -o user,pid,args -p $(systemctl show -p MainPID --value cosint-signaling)
> ```

> **`journalctl` sans `sudo` peut afficher « No entries »** si votre compte n'appartient
> ni à `adm` ni à `systemd-journal` — un faux négatif trompeur. Utilisez toujours `sudo`.

---

## 6. Marque d'organisation

En mode 100 % local, le serveur peut co-marquer l'écran d'accueil : logo, nom, sous-titre,
couleur d'accent. C'est **purement cosmétique** — aucun effet sur le chiffrement. Le
marquage n'apparaît jamais en mode standard (serveurs publics), et l'identité « COSINT »
reste visible à côté du vôtre.

| Variable | Rôle | Contrainte |
| --- | --- | --- |
| `COSINT_ORG_NAME` | Nom affiché — **obligatoire** pour activer la marque | ≤ 60 caractères |
| `COSINT_ORG_SUBTITLE` | Sous-titre | ≤ 140 caractères |
| `COSINT_ORG_ACCENT` | Couleur d'accent | `#RRGGBB` |
| `COSINT_ORG_LOGO` | Chemin d'un logo | `.png` `.jpg` `.gif` `.webp` `.svg`, **≤ 300 Ko** |

À ajouter au bloc `[Service]` — noter les guillemets sur les valeurs à espaces :

```ini
Environment="COSINT_ORG_NAME=Votre Organisation"
Environment="COSINT_ORG_SUBTITLE=Votre accroche ou service"
Environment=COSINT_ORG_ACCENT=#1b3a6b
Environment=COSINT_ORG_LOGO=/opt/cosint/server/logo.png
```

### Le logo

Transférez-le depuis un poste :

```bash
scp logo.png <UTILISATEUR>@<IP_SERVEUR>:/opt/cosint/server/logo.png
```

**Vérifiez le poids — la limite de 300 Ko est stricte et le dépassement est silencieux :**

```bash
ls -lh /opt/cosint/server/logo.png
```

Au-delà, compressez (depuis le dossier contenant le fichier) :

```bash
cd /opt/cosint/server
cp logo.png logo-orig.png
convert logo-orig.png -resize 512x512\> -strip logo.png
ls -lh logo.png
```

Toujours trop lourd ? Réduisez la palette — très efficace sur les logos à aplats, sans
perte visible :

```bash
convert logo-orig.png -resize 512x512\> -strip -colors 64 logo.png
```

Assurez-vous que le compte du service peut lire le fichier :

```bash
sudo chown cosint:cosint /opt/cosint/server/logo.png
```

### Contrôler le résultat

```bash
sudo systemctl restart cosint-signaling
sudo journalctl -u cosint-signaling -n 3 --no-pager
```

Le message de démarrage indique la marque servie. S'il affiche un nom **tronqué**, il
manque des guillemets. S'il ne mentionne aucun logo : fichier introuvable, trop lourd,
format refusé, ou illisible par le compte du service.

Côté application, la marque est récupérée **à l'ouverture de la WebSocket** : il faut se
reconnecter (fermer/rouvrir l'app, ou rebasculer le mode 100 % local) pour la voir
changer.

---

## 7. Pare-feu

### Identifier ce qui filtre

Ne présumez pas d'ufw : beaucoup de serveurs utilisent iptables/nftables directement.

```bash
sudo iptables -S INPUT
sudo nft list ruleset | grep -E 'policy|dport'
systemctl list-units --type=service --state=running | grep -iE 'firewall|nftables|fail2ban'
```

Si vous lisez `-P INPUT DROP`, la politique est en liste blanche : **tout est rejeté
silencieusement sauf ce qui est explicitement autorisé.** Un port non listé ne renvoie
rien du tout, d'où des *timeout* et non des *connection refused*.

### Ouvrir le port

```bash
# ufw
sudo ufw allow from <SOUS_RESEAU>/24 to any port 4444 proto tcp

# iptables — adapter l'interface
sudo iptables -A INPUT -i <INTERFACE> -s <SOUS_RESEAU>/24 -p tcp --dport 4444 -j ACCEPT

# nftables natif
sudo nft add rule inet filter input ip saddr <SOUS_RESEAU>/24 tcp dport 4444 accept
```

> **Filtrage par adresse MAC : à relativiser.** Une MAC se falsifie en une commande. Comme
> garde-fou contre les erreurs de configuration, pourquoi pas ; comme contrôle d'accès,
> non. Le vrai contrôle, c'est le jeton. Ouvrir au sous-réseau est plus simple à maintenir
> et n'affaiblit pas le modèle de sécurité.

### Rendre la règle persistante

**Une règle `iptables` disparaît au redémarrage.** Vérifiez ce qui les restaure :

```bash
systemctl list-unit-files | grep -iE 'iptables|netfilter'
ls -l /etc/iptables/
```

Si `netfilter-persistent` est présent :

```bash
sudo cp /etc/iptables/rules.v4 /etc/iptables/rules.v4.bak-$(date +%F)
sudo netfilter-persistent save
sudo grep 4444 /etc/iptables/rules.v4
```

Sinon : `sudo apt install iptables-persistent`.

> **Si Docker tourne sur la machine**, `netfilter-persistent save` fige aussi les chaînes
> `DOCKER-*`. Au démarrage suivant, elles seront restaurées **puis** recréées par Docker →
> doublons possibles. Rarement bloquant, mais c'est la première piste si vos conteneurs se
> comportent mal après un reboot. Alternative propre : porter la règle COSINT dans un
> script dédié appelé par une unité systemd, plutôt que dans le dump global.

### Le point souvent oublié : IPv6

Une politique IPv4 en liste blanche ne sert à rien si IPv6 est grand ouvert. Le serveur
écoute sur `*:4444`, donc en dual-stack.

```bash
sudo ip6tables -S INPUT
```

Si vous lisez `-P INPUT ACCEPT` sans règle, votre filtrage est contournable :

```bash
sudo ip6tables -P INPUT DROP
sudo ip6tables -A INPUT -i lo -j ACCEPT
sudo ip6tables -A INPUT -m state --state RELATED,ESTABLISHED -j ACCEPT
sudo netfilter-persistent save
```

> ⚠️ **Gardez une session SSH ouverte** pendant l'opération et vérifiez depuis une seconde
> session que vous pouvez toujours vous connecter, **avant** de fermer la première. Une
> règle IPv6 trop stricte peut vous couper l'accès si votre SSH passe par IPv6.

### Si le réseau n'est pas de confiance : TLS

En `ws://`, le jeton et les métadonnées circulent en clair. Derrière un reverse-proxy :

```bash
sudo apt install -y caddy
# /etc/caddy/Caddyfile
#   cosint.interne.lan {
#       reverse_proxy localhost:4444
#   }
```

Les postes utilisent alors `wss://cosint.interne.lan`, et vous pouvez ajouter au niveau du
proxy une liste blanche d'IP, voire du **mTLS** (certificat client par poste) pour un parc
maîtrisé.

---

## 8. Vérification de bout en bout

Dans cet ordre — chaque étape isole une couche différente.

**1. Le service tourne**

```bash
sudo systemctl status cosint-signaling
sudo ss -tlnp | grep 4444
```

**2. Il répond en local** (teste le service, pas le réseau)

```bash
nc -zvn -w 3 127.0.0.1 4444
```

**3. Il répond depuis un poste** (teste le réseau et le pare-feu)

```bash
nc -zvn -w 3 <IP_SERVEUR> 4444
```

Le `-n` évite un message parasite de résolution DNS inverse, le `-w 3` coupe l'attente.
Sous Windows : `Test-NetConnection <IP_SERVEUR> -Port 4444`.

**4. La configuration survit à un redémarrage**

```bash
sudo systemctl reboot
# au retour :
sudo iptables -S INPUT | grep 4444
systemctl status cosint-signaling
sudo journalctl -u cosint-signaling -n 3 --no-pager
```

---

## 9. Provisionnement des postes

### Configuration manuelle

**Paramètres → Réseau** :

| Champ | Valeur |
| --- | --- |
| Mode 100 % local | Activé |
| Serveur de signalisation | `ws://<IP_SERVEUR>:4444` |
| Jeton d'accès | Le jeton généré |
| STUN / TURN | **Vides** |
| Retrouver automatiquement le serveur | **Coché** (recommandé si DHCP) |
| Garder les mises à jour activées | **Votre choix** — voir ci-dessous |

**Pourquoi vider STUN/TURN :** sur un LAN, les pairs se découvrent par candidats hôtes
directs — STUN ne sert qu'à découvrir une IP publique, inutile ici. En mode 100 % local il
n'y a **aucun repli silencieux** vers les serveurs publics : un champ vide ou invalide
laisse les tableaux partagés hors ligne, sans contournement.

> **⚠️ Nouveau en v1.8.8 — la vérification de mise à jour est ACTIVE par défaut, même en
> 100 % local.** Trop de postes basculés en local restaient bloqués des mois sur une
> version ancienne sans que personne ne le sache. GitHub Releases devient alors le **seul**
> service public contacté (aucune donnée de tableau n'y transite : elle reste chiffrée
> entre postes). **Sur un réseau réellement isolé, décochez « Garder les mises à jour
> activées »** — le récapitulatif repasse aussitôt au vert.

Le récapitulatif « ce que l'application va contacter » est calculé par la fonction qui
ouvre réellement les connexions : **il doit refléter exactement votre politique.** C'est
votre preuve de cloisonnement — vérifiez-le sur chaque poste.

### Découverte automatique (serveur en DHCP)

**Le problème.** En DHCP, l'adresse du serveur change — souvent chaque nuit. Jusqu'à la
v1.8.8, il fallait relever la nouvelle adresse, refaire un `.cosint-org` et le réimporter
sur chaque poste. Tous les matins.

**Ce que fait la v1.8.9.** Le serveur publie une **empreinte d'identité** sur
`GET /cosint`, sans authentification :

```bash
curl -s http://<IP_SERVEUR>:4444/cosint
# {"cosint":1,"id":"069dc41621ee0610c845dcd3912ccc2b"}
```

Cette empreinte est un `sha256("cosint-discovery-v1:" + COSINT_TOKEN)` tronqué. Elle est
aussi affichée au démarrage du service :

```bash
sudo journalctl -u cosint-signaling -n 3 --no-pager
# Découverte automatique : GET /cosint → empreinte 069dc41621ee0610c845dcd3912ccc2b.
```

Chaque poste dérive la **même** empreinte depuis le jeton qu'il détient, puis :

1. vérifie l'adresse enregistrée — une requête, et c'est terminé dans le cas courant ;
2. si elle ne répond plus, **balaie ses propres sous-réseaux privés** sur le seul port
   configuré ;
3. n'accepte **que** le serveur dont l'empreinte correspond, et réécrit son adresse.
   Un message le signale : « Serveur retrouvé — nouvelle adresse … ».

**Pourquoi c'est sûr.** L'empreinte prouve la connaissance du jeton **sans le révéler**
(le jeton du guide fait 24 octets aléatoires : non brute-forçable). Le poste ne transmet
son jeton **qu'après** avoir identifié le bon serveur : un serveur pirate posé sur le même
réseau ne peut donc ni usurper l'identité du vôtre, ni se faire livrer le jeton. Rien
d'autre n'est exposé — ni le nom d'organisation, ni le logo, ni les rooms : la marque
reste derrière le contrôle de jeton.

> **⚠️ Sans `COSINT_TOKEN`, l'empreinte est une constante** : n'importe quel serveur COSINT
> ouvert du réseau correspond. La découverte devient une commodité, pas une garantie —
> une raison de plus de définir un jeton.

**Ce qui est balayé, et rien d'autre :** les plages **privées** des interfaces du poste
(au plus un /24 par interface, 3 interfaces), sur le **seul port** déjà configuré. Jamais
une plage publique, jamais un autre port.

**Le réglage** — Paramètres → Réseau → *Découverte du serveur* : la case « Retrouver
automatiquement le serveur s'il change d'adresse » est **cochée par défaut**, et le bouton
**Rechercher** force une recherche immédiate (utile après avoir saisi un jeton).

Sur un poste **hors du réseau** (à la maison, sur un autre site), aucune empreinte ne
correspond : rien ne bouge, le poste reste simplement hors ligne. C'est le comportement
voulu.

> **Le serveur doit tourner en v1.8.9 ou plus.** Un serveur antérieur ne répond pas sur
> `/cosint` : la découverte échoue silencieusement et l'adresse reste à saisir à la main.
> Mise à jour : voir [§11](#11-exploitation-courante).

### Provisionnement automatique : le fichier `.cosint-org`

Plutôt que faire saisir l'adresse et le jeton à chaque agent, distribuez un profil.

**Depuis un poste déjà configuré** — méthode de référence :
**Paramètres → Réseau → Profil d'organisation → Exporter**.

**Ou en le générant sur le serveur.** Le format est un JSON versionné ; cette commande y
injecte le jeton sans jamais l'afficher :

```bash
TOKEN=$(sudo grep -oP '(?<=COSINT_TOKEN=)\S+' /etc/systemd/system/cosint-signaling.service)

sudo tee /opt/cosint/organisation.cosint-org > /dev/null <<EOF
{
  "cosintOrgProfile": 1,
  "signalingUrl": "ws://<IP_SERVEUR>:4444",
  "token": "$TOKEN",
  "organization": "Votre Organisation"
}
EOF

sudo chmod 600 /opt/cosint/organisation.cosint-org
unset TOKEN
```

Le heredoc doit être **non quoté** (`<<EOF` et non `<<'EOF'`) pour que `$TOKEN` soit
substitué. Vérifiez :

```bash
sudo node -e "console.log(JSON.parse(require('fs').readFileSync('/opt/cosint/organisation.cosint-org','utf8')))"
```

Contraintes du parseur : `cosintOrgProfile` doit valoir `1`, `signalingUrl` doit être en
`ws://` ou `wss://` (≤ 300 caractères), jeton ≤ 512, organisation ≤ 60. Le champ
`organization` est indicatif — le nom réellement affiché vient du serveur.

**Sur chaque poste** : Paramètres → Réseau → Profil d'organisation → **Importer**,
vérifier, enregistrer. Mode 100 % local, adresse et jeton sont réglés d'un coup ; logo et
titre arrivent du serveur à la connexion.

> **Ce fichier contient le jeton en clair.** Distribuez-le par clé USB ou partage interne,
> jamais par e-mail ou messagerie grand public. Traitez-le comme un secret : `chmod 600`,
> et supprimez-le des postes après import si votre politique l'exige.

---

## 10. Dépannage

### Lire le symptôme réseau

| Symptôme | Interprétation |
| --- | --- |
| `Connection refused` **immédiat** | Le port est atteint, mais rien n'écoute → service arrêté ou planté |
| `Connection timed out` | Paquets détruits en silence → pare-feu en `DROP`, ou machine injoignable |
| Le ping échoue mais SSH fonctionne | Normal : ICMP non autorisé. Ne concluez pas que la machine est éteinte |
| OK en `127.0.0.1`, timeout depuis un poste | Le service va bien, le pare-feu bloque |
| Aucune entrée ARP (`ip neigh`) pour la cible | Machine éteinte, IP changée… ou tout simplement filtrée |

`DROP` ne renvoie rien : le client réessaie puis abandonne, d'où le *timeout*. `REJECT`
répondrait immédiatement. La différence est votre meilleur indice.

### Problèmes courants

**Le serveur démarre puis s'arrête aussitôt**
```bash
sudo journalctl -u cosint-signaling -n 30 --no-pager
```
Cherchez `EADDRINUSE` : le port est déjà pris. Changez-le dans le service, ou libérez-le.

**La marque affiche un nom tronqué** — guillemets manquants sur `Environment=`. Voir
[§5](#️-piège--les-valeurs-contenant-des-espaces).

**Le logo n'apparaît pas** — dans l'ordre : poids > 300 Ko, chemin erroné, format non
supporté, fichier illisible par le compte du service, ou application non reconnectée.

**Un poste ne se connecte pas alors que le port répond** — jeton absent ou erroné. Le
refus survient avant l'ouverture de la WebSocket : le poste ne voit ni la marque, ni
message d'erreur détaillé.

**Le récapitulatif mentionne GitHub alors que le réseau est isolé** — depuis la v1.8.8, la
vérification de mise à jour reste active par défaut en 100 % local. Décochez « Garder les
mises à jour activées » (Paramètres → Réseau).

**Tout marchait, plus rien après un redémarrage** — règles de pare-feu non persistées, ou
IP du serveur modifiée par le DHCP (la découverte automatique doit alors la retrouver :
vérifiez que le serveur tourne en v1.8.9 ou plus).

**La découverte automatique ne retrouve pas le serveur** — dans l'ordre : serveur en
version antérieure à la v1.8.9 (`curl http://<IP_SERVEUR>:4444/cosint` doit renvoyer du
JSON) ; jeton différent entre le poste et le serveur (les empreintes ne correspondent
pas) ; poste sur un autre réseau que le serveur ; pare-feu bloquant le port depuis le
poste ; isolation des clients Wi-Fi. Le bouton **Rechercher** des Paramètres donne un
retour immédiat.

**`git clone` ou `npm install` refusés dans `/opt`** — droits. Utilisez `sudo`, ou
installez dans un répertoire vous appartenant.

**Deux machines sur le même sous-réseau ne se voient pas du tout** — isolation des clients
Wi-Fi (« client isolation », « AP isolation ») activée sur la box. À désactiver, ou passer
en filaire.

---

## 11. Exploitation courante

### Journal en direct

```bash
sudo journalctl -u cosint-signaling -f
```

### Révoquer l'accès de tous les postes

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
sudo nano /etc/systemd/system/cosint-signaling.service
sudo systemctl daemon-reload && sudo systemctl restart cosint-signaling
```

Régénérez ensuite le `.cosint-org` et rediffusez-le. Tout poste conservant l'ancien jeton
est refusé.

### Mettre à jour COSINT

```bash
cd /opt/cosint
sudo git pull
cd server && sudo npm install --omit=dev
sudo systemctl restart cosint-signaling
```

Vérifiez ensuite les notes de version : le format `.cosint-org` est versionné
(`cosintOrgProfile: 1`) et pourrait évoluer.

### Consulter le jeton actif

```bash
# valeur configurée
sudo grep COSINT_TOKEN /etc/systemd/system/cosint-signaling.service

# valeur réellement chargée par le processus
sudo tr '\0' '\n' < /proc/$(systemctl show -p MainPID --value cosint-signaling)/environ | grep COSINT_TOKEN
```

Une différence entre les deux signale un `daemon-reload` ou un `restart` oublié.

---

## Récapitulatif

- [ ] Node ≥ 18 installé
- [ ] Dépôt cloné, `npm install` effectué
- [ ] IP du serveur figée (réservation DHCP) — ou découverte automatique validée
- [ ] Compte d'exécution choisi, droits ajustés
- [ ] Jeton généré et jamais divulgué
- [ ] Service systemd actif et activé au démarrage
- [ ] Aucune ligne `Invalid` dans le journal
- [ ] Marque affichée en entier, logo < 300 Ko
- [ ] Port ouvert au sous-réseau
- [ ] Règles de pare-feu persistantes
- [ ] IPv6 traité
- [ ] Test `nc` concluant depuis un poste
- [ ] Redémarrage validé
- [ ] `.cosint-org` généré et distribué de façon sûre
- [ ] Politique de mise à jour tranchée (activée, ou décochée si réseau isolé)
- [ ] Récapitulatif « ce que l'app va contacter » vérifié sur chaque poste

---

*Basé sur COSINT v1.8.9 — https://github.com/k0nrd/COSINT*
