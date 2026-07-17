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
