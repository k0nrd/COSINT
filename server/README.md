# Serveur de signalisation COSINT

Ce dossier contient un serveur de signalisation **autonome** (~140 lignes, une seule
dépendance : `ws`) compatible avec le protocole y-webrtc utilisé par COSINT.

## Ce que voit (et ne voit pas) ce serveur

- Il **voit** : des identifiants de room *dérivés* du code de partage (HKDF, non
  réversibles — impossible d'en déduire le code) et des messages de mise en relation
  **chiffrés en AES-GCM** avec une clé dérivée du code.
- Il **ne voit jamais** : le contenu des tableaux, les pseudos, les codes de partage,
  les secrets de session. Les données circulent ensuite **directement entre pairs**
  (WebRTC chiffré), jamais par ce serveur.

Héberger votre propre serveur est donc sans risque pour la confidentialité, et
recommandé pour un usage professionnel (les serveurs publics sont un service
communautaire sans garantie — voir DECISIONS.md à la racine).

## Test local (30 secondes)

```bash
cd server
npm install
npm start                 # écoute sur le port 4444
```

Puis, dans COSINT : Paramètres → Réseau → `ws://localhost:4444` (ou
`ws://IP-DU-POSTE:4444` depuis un autre poste du même réseau local).

## Déploiement gratuit en 5 minutes (Render)

[Render](https://render.com) héberge gratuitement les petits services web avec une
URL `wss://` permanente (offre gratuite vérifiée en juillet 2026).

1. Créez un compte sur render.com (aucune carte bancaire requise).
2. Poussez ce dossier `server/` dans un dépôt Git (GitHub/GitLab), ou forkez le
   dépôt COSINT.
3. Sur Render : **New → Web Service** → connectez le dépôt.
   - *Root Directory* : `server`
   - *Build Command* : `npm install`
   - *Start Command* : `node signaling.js`
   - *Instance Type* : **Free**
4. Déployez. Render vous donne une URL du type `https://mon-service.onrender.com`.
5. Dans COSINT : Paramètres → Réseau → `wss://mon-service.onrender.com`
   (remplacez `https://` par `wss://`). Chaque participant doit renseigner la même
   adresse.

**Limite connue de l'offre gratuite Render** : le service s'endort après ~15 min
d'inactivité ; la première connexion le réveille en 30–60 s (l'app réessaie
automatiquement — l'état « Connexion au réseau… » peut durer une minute au premier
accès de la journée). Pour un service toujours actif : l'offre payante Render,
un VPS, ou Cloudflare Workers + Durable Objects (nécessite d'adapter le script).

## Autres options

- **Docker** : `docker run -d -p 4444:4444 -e PORT=4444 node:20-alpine sh -c
  "npm install -g ws && node /srv/signaling.js"` (montez le script dans `/srv`),
  derrière un reverse-proxy TLS (Caddy, nginx) pour obtenir `wss://`.
- **VPS / serveur interne** : `node signaling.js` derrière nginx/Caddy en TLS.
  En réseau strictement local, `ws://` sans TLS fonctionne aussi.

> Rappel : sans TLS (`ws://`), utilisez le serveur uniquement sur un réseau de
> confiance. Les messages y-webrtc restent chiffrés de bout en bout, mais les
> métadonnées (identifiants de room, adresses IP) passeraient en clair.

## Restreindre l'accès aux seuls postes autorisés

> « Y a-t-il un moyen d'empêcher tout poste extérieur d'utiliser notre serveur ? »
> Oui — et plusieurs couches se combinent, de la plus simple à la plus stricte.

**D'abord, le point rassurant.** Même un serveur **entièrement ouvert** ne compromet
aucune enquête : un intrus ne peut ni lire ni rejoindre un tableau. Les identifiants de
room sont dérivés du **code de partage** (HKDF, non réversibles) et le contenu est
**chiffré de bout en bout** — sans le code, impossible de calculer la bonne room, encore
moins de déchiffrer quoi que ce soit. Restreindre l'accès sert donc à **empêcher
l'utilisation de votre relais** par des tiers et à **réduire la surface d'attaque**, pas à
protéger les données (elles le sont déjà par cryptographie).

### 1. Jeton d'accès pré-partagé (intégré, recommandé)

Définissez la variable d'environnement **`COSINT_TOKEN`** : le serveur **exige** alors ce
jeton et **refuse toute connexion** sans le bon jeton — **dès la poignée de main**, avant
même d'ouvrir la WebSocket (réponse `401`, comparaison à temps constant). Aucun poste sans
le jeton ne peut donc utiliser le relais ni même lire la marque d'organisation.

```bash
COSINT_TOKEN="un-secret-long-et-aleatoire" node signaling.js
```

Côté COSINT, chaque poste autorisé saisit ce jeton dans **Paramètres → Réseau → Jeton
d'accès** (ou, plus simple, reçoit un **profil d'organisation `.cosint-org`** qui
pré-remplit adresse + jeton en un clic — voir plus bas). Le jeton part en paramètre
`?token=` de l'URL : **utilisez `wss://` (TLS)** pour qu'il soit chiffré en transit.

> Générer un bon jeton : `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.
> Distribuez-le (ou le fichier `.cosint-org`) par un canal de confiance. Le fichier
> `.cosint-org` **contient le jeton en clair** : traitez-le comme un secret. Pour le
> révoquer, changez `COSINT_TOKEN` et rediffusez un nouveau profil.

### 2. Isolement réseau (le plus sûr, et souvent le plus simple)

Faites simplement en sorte que le serveur **ne soit pas joignable depuis l'extérieur** :
hébergez-le sur le **LAN interne** ou derrière le **VPN** du service, sans exposition
publique. Un intrus qui ne peut pas atteindre le port ne peut rien tenter. Idéal pour un
déploiement en réseau fermé, à combiner avec le jeton (défense en profondeur).

### 3. TLS obligatoire (`wss://`)

Derrière un reverse-proxy (Caddy, nginx), chiffre le jeton et toutes les métadonnées en
transit. Indispensable dès que le serveur est joignable via un réseau non maîtrisé.

### 4. Contrôles au reverse-proxy (durcissement maximal)

Au niveau de nginx/Caddy, en amont de Node :

- **Liste blanche d'IP** : n'autoriser que les sous-réseaux des postes (`allow …; deny all;`).
- **mTLS (certificats clients)** : authentification cryptographique **par poste** — le
  proxy n'accepte que les clients présentant un certificat émis par votre autorité interne.
  Le plus robuste pour un parc maîtrisé.

## Personnaliser l'écran principal (marque d'organisation)

En mode **100 % local**, le serveur peut **co-marquer** l'écran d'accueil de COSINT :
logo + nom de l'organisation + accroche, servis par le serveur lui-même (l'application les
récupère sur le **même canal WebSocket**, sans nouvelle requête réseau). C'est purement
**cosmétique** : cela ne change **rien** au chiffrement ni à la confidentialité, et
n'apparaît **jamais** en mode standard (serveurs publics).

Renseignez ces variables d'environnement (toutes facultatives ; sans `COSINT_ORG_NAME`,
aucune marque n'est servie) :

| Variable | Rôle | Contrainte |
| --- | --- | --- |
| `COSINT_ORG_NAME` | Nom affiché (obligatoire pour activer la marque) | ≤ 60 caractères |
| `COSINT_ORG_SUBTITLE` | Sous-titre / accroche | ≤ 140 caractères |
| `COSINT_ORG_ACCENT` | Couleur d'accent de l'accueil | `#RRGGBB` |
| `COSINT_ORG_LOGO` | Chemin d'un logo | `.png/.jpg/.gif/.webp/.svg`, ≤ 300 Ko |

```bash
COSINT_TOKEN="…" \
COSINT_ORG_NAME="Votre organisation" \
COSINT_ORG_SUBTITLE="Cellule d'enquête numérique" \
COSINT_ORG_ACCENT="#1b3a6b" \
COSINT_ORG_LOGO="./logo-organisation.png" \
node signaling.js
```

Le logo est encodé en data-URI et affiché via `<img>` (aucun script exécuté, même pour un
SVG). Côté application, tout est **revalidé et borné** avant affichage : le nom mène,
l'identité « COSINT » reste visible (jamais de confusion sur l'origine du logiciel).

## Provisionner un poste en un clic (fichier `.cosint-org`)

Pour éviter à chaque agent de saisir l'adresse et le jeton à la main : dans COSINT,
**Paramètres → Réseau → Profil d'organisation → Exporter** produit un fichier
**`.cosint-org`** (adresse du serveur interne + jeton). Distribuez-le aux postes autorisés ;
l'agent fait **Importer un profil**, vérifie, enregistre — le mode 100 % local, l'adresse et
le jeton sont configurés d'un coup, et le logo/titre apparaissent automatiquement.

> Ce fichier contient le jeton en clair : distribuez-le par un canal de confiance.
