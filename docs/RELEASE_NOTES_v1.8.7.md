# Release notes — v1.8.7

> Texte prêt à coller dans la GitHub Release (section anglaise d'abord, française
> ensuite, comme les README).

---

## 🇬🇧 English

A deployment release for closed networks: in **100 % local mode**, COSINT can now wear **your
organization's branding**, and your **signaling server can be locked to authorized stations**
with a shared access token — pushed to each computer in one click via a portable profile.

### 🏷️ Your organization's branding (100 % local mode)

When COSINT runs against your **internal signaling server**, the home screen can show **your
logo, name and tagline** — served by the server itself, over the **same WebSocket channel**,
with no new network request. It stays **co-branded *"· on COSINT"*** so the origin of the
software is never ambiguous, and an optional **accent color** retints the home screen only.

Everything is configured **server-side** with a few environment variables
(`COSINT_ORG_NAME`, `COSINT_ORG_SUBTITLE`, `COSINT_ORG_ACCENT`, `COSINT_ORG_LOGO`). It is
**purely cosmetic** — it changes **nothing** about the end-to-end encryption, and never shows
in standard mode.

### 🔑 Lock your signaling server to authorized stations

Set a single environment variable **`COSINT_TOKEN`** on your server and it now **requires that
token**: any computer without it is **refused at the WebSocket handshake** (HTTP 401), before a
room is ever joined or the branding is ever read. The token is compared in **constant time**,
entered per station in **Settings → Network**, **masked on screen**, stripped from every
diagnostic, and **never sent to the public default servers**.

Even *without* a token nothing sensitive leaks — rooms are HKDF-derived and content is
end-to-end encrypted — so the token is about **who may use your relay**, layered on top of the
network-isolation / TLS / reverse-proxy controls now documented in `server/README.md`.

### 📇 One-click provisioning (`.cosint-org` profile)

An admin can **export** a small portable **`.cosint-org`** profile (internal server address +
access token) from Settings, and each colleague **imports** it to configure 100 % local mode,
the server address and the token **in one go** — then reviews and saves. No technical knowledge
required, and the logo/title then appear automatically.

### Under the hood

- Branding travels over the **same WebSocket** used for signaling (production CSP unchanged:
  `connect-src ws: wss:`, `img-src data:`); the logo is a **data-URI rendered via `<img>`** —
  no script runs, even for an SVG — and every field is **re-validated and bounded** client-side
  before display.
- The access token is verified at the **WebSocket upgrade** in constant time; unauthorized
  stations never reach a room.
- The `.trace` format is **unchanged (v7)**, fully backward compatible; no data-model change.
- **279 tests total** (a new suite locks the branding/profile sanitization boundary),
  production build OK, Windows + Linux packaged.

---

## 🇫🇷 Français

Une mise à jour pensée pour les déploiements en réseau fermé : en **mode 100 % local**, COSINT
peut désormais porter **la marque de votre organisation**, et votre **serveur de signalisation
peut être verrouillé aux seuls postes autorisés** grâce à un jeton d'accès partagé — poussé sur
chaque poste en un clic via un profil portable.

### 🏷️ La marque de votre organisation (mode 100 % local)

Quand COSINT tourne face à votre **serveur de signalisation interne**, l'écran d'accueil peut
afficher **votre logo, votre nom et votre accroche** — servis par le serveur lui-même, sur le
**même canal WebSocket**, sans aucune nouvelle requête réseau. Le tout reste **co-marqué
*« · sur COSINT »*** pour que l'origine du logiciel ne soit jamais ambiguë, et une **couleur
d'accent** facultative reteinte l'accueil uniquement.

Tout se configure **côté serveur**, via quelques variables d'environnement (`COSINT_ORG_NAME`,
`COSINT_ORG_SUBTITLE`, `COSINT_ORG_ACCENT`, `COSINT_ORG_LOGO`). C'est **purement cosmétique** —
cela ne change **rien** au chiffrement de bout en bout, et n'apparaît jamais en mode standard.

### 🔑 Verrouillez votre serveur de signalisation aux seuls postes autorisés

Définissez une seule variable d'environnement **`COSINT_TOKEN`** sur votre serveur : il **exige**
alors ce jeton, et tout poste qui ne l'a pas est **refusé dès la poignée de main WebSocket**
(HTTP 401), avant même de rejoindre une room ou de lire la marque. Le jeton est comparé à
**temps constant**, saisi par poste dans **Paramètres → Réseau**, **masqué à l'écran**, retiré
de tous les diagnostics, et **jamais transmis aux serveurs publics** par défaut.

Même *sans* jeton, rien de sensible ne fuit — les rooms sont dérivées par HKDF et le contenu est
chiffré de bout en bout — le jeton décide donc **qui peut utiliser votre relais**, en complément
de l'isolement réseau / TLS / contrôles au reverse-proxy désormais documentés dans
`server/README.md`.

### 📇 Provisionnement en un clic (profil `.cosint-org`)

Un administrateur peut **exporter** depuis les Paramètres un petit profil portable
**`.cosint-org`** (adresse du serveur interne + jeton d'accès), que chaque collègue **importe**
pour configurer **d'un coup** le mode 100 % local, l'adresse du serveur et le jeton — puis
vérifie et enregistre. Aucune connaissance technique requise, et le logo/titre s'affichent
ensuite automatiquement.

### Sous le capot

- La marque transite par le **même WebSocket** que la signalisation (CSP de production
  inchangée : `connect-src ws: wss:`, `img-src data:`) ; le logo est une **data-URI affichée via
  `<img>`** — aucun script exécuté, même pour un SVG — et chaque champ est **revalidé et borné**
  côté client avant affichage.
- Le jeton d'accès est vérifié à l'**upgrade WebSocket**, à temps constant ; un poste non
  autorisé n'atteint jamais de room.
- Le format `.trace` est **inchangé (v7)**, totalement rétro-compatible ; aucun changement de
  modèle de données.
- **279 tests au total** (une nouvelle suite verrouille la frontière d'assainissement
  marque/profil), build de production OK, packaging Windows + Linux.
