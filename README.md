<p align="center">
  <img src="docs/assets/bannerpng.png" alt="COSINT — collaborative OSINT investigation board" width="100%">
</p>

<p align="center">
  <b>English</b> · <a href="./README.fr.md">Français</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.8.5-06b6d4" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-3fbf6a" alt="License">
  <img src="https://img.shields.io/badge/platform-Windows%20·%20Linux-8b5cf6" alt="Platform">
  <img src="https://img.shields.io/badge/tests-251%20passing-3fbf6a" alt="Tests">
  <img src="https://img.shields.io/badge/telemetry-none-ef4444" alt="No telemetry">
  <img src="https://img.shields.io/badge/Electron%20·%20React%20·%20Yjs-1f2937" alt="Built with">
</p>

<p align="center">
  <i>Map entities, connect them, attach sources, and build a case visually —<br>
  alone or in real time with colleagues, without your data ever touching a server.</i>
</p>

---

## ✨ What is COSINT?

**COSINT** is a desktop **investigation board for OSINT work**. Drop entities on a canvas
(people, accounts, phone numbers, domains, IPs, crypto wallets, vehicles, events, places…),
link them, grade and attach your sources, and watch the case take shape — **solo or
collaboratively in real time**.

The twist: **there is no backend.** Peers sync **directly**, end-to-end encrypted, and
board content never reaches any server — not even an encrypted copy.

> 🇫🇷 **UI language:** the interface is **French** for now. The codebase is i18n-ready
> (`src/renderer/src/i18n/`) — an English dictionary is a very welcome contribution.

<table>
<tr>
<td width="50%" valign="top">

### 🔒 Private by architecture
No account, no cloud, no telemetry. Board content flows **peer-to-peer** over WebRTC,
**AES-GCM end-to-end encrypted**, with a key that never leaves your machines.

</td>
<td width="50%" valign="top">

### 🧭 Built for real casework
~90 entity types, graded sources (Admiralty scale), status badges, rich links,
two timelines, CSV/PNG/`.trace` export, custom entity types per board.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🌐 Works your way
Online in real time, **fully offline**, or in a **100 % local** mode that contacts
*only* the internal servers you configure — with live proof of what it will reach.

</td>
<td width="50%" valign="top">

### 🧩 No lock-in
Everything is a portable `.trace` (JSON) file on your disk. Copy nodes, images and
whole subgraphs to the clipboard and paste them anywhere.

</td>
</tr>
</table>

---

## 🚀 What's new in 1.8.5

- **🎚️ Neutral zoom navigator** — the bottom widen/thin bar is now **grey** (dark in dark
  mode, light in light mode) instead of blue, so it no longer looks permanently selected.
- **🏷️ Cleaner event labels** — dropped the coloured left stripe on event cards (the colour
  already lives on the range bar). Precise-date events keep a slim coloured position marker.
- **🎨 Coloured uncertainty bars** — hatched *fork* ranges now use the **event's colour**
  (a red event → red hatching) instead of always grey.
- **🐧 Linux builds** — AppImage + `.deb` now ship alongside the Windows installer/portable.

Full notes: [`docs/RELEASE_NOTES_v1.8.5.md`](docs/RELEASE_NOTES_v1.8.5.md).

---

## ⚡ Features

**Investigation canvas**
- ~90 entity types in a taxonomy (person, company, username, email, phone, domain, IP,
  crypto wallet, vehicle, **event**, location…) with per-type field templates.
- **Dedicated modules (1.8.1)** — searchable catalogs for banks, cryptos, brands,
  operators, countries, card networks, hash algorithms; always a free *"Other"* value.
- **Custom entity types per board** — define your own (name, icon, color, field template);
  synced to every peer and saved in the `.trace` export.
- **Event dating** — an exact date/time, an *earliest → latest* uncertainty window, or a
  precise *from → to* duration.
- Notes (markdown), timestamped notes, images, syntax-highlighted code blocks, link
  cards, group zones.
- Sources graded on the **Admiralty scale** (reliability A–F / credibility 1–6), attachable
  to any element, with a Markdown source report.
- Status badges, tags, free colors, accent-insensitive full-text search, filters, legend,
  minimap, and **two explorable timelines** — when items were *added*, and when events
  *happened*.
- CSV import (smart column detection), CSV export (per-column), whole-board PNG,
  portable `.trace` JSON.

**Links you fully control**
- Relation types, free labels, direction arrows, color/width/dash, curve/straight/step.
- **Draw-your-own-path** mode: pick the exact exit side on A, click the waypoints, pick
  the entry side on B — live preview, one undo step, automatic routing as the default.

**Real-time collaboration (P2P)**
- Share with a **12-character code** (60 bits of entropy). New participants wait in a
  **lobby** and are admitted by an online member (open / approval / private).
- Roles (admin / editor / visitor), participant limit (2–10), code revocation & rotation.
- Presence: cursors, selections, avatars, availability.

---

## 🛡️ Privacy & security model

| What | Where it goes | Third party sees content? |
|---|---|---|
| Board content (entities, links, images…) | **Directly peer ↔ peer** (WebRTC, AES-GCM E2E) | Never — it touches no server |
| Peer-discovery handshake (encrypted) | Signaling server (public by default, self-hostable) | No — opaque room ID + encrypted blobs |
| Public-IP discovery | STUN (Google/Cloudflare/Twilio by default, replaceable) | No data at all |
| Data relay (TURN) | **Does not exist** by design | — |
| Update check | GitHub Releases (optional, off in local mode) | — |

- Share code → room ID and encryption key are derived **locally** (HKDF-SHA-256, separate
  contexts); the code itself is never transmitted.
- Boards are encrypted with a **random session secret** *not derivable from the code*,
  sealed to each approved member (ECDH P-256 → AES-GCM).
- Full details (French): [GUIDE.fr.md](./GUIDE.fr.md) · [DECISIONS.md](./DECISIONS.md).

### 100 % local mode (closed networks)

**Settings → Network & privacy** contacts **only** the internal addresses you enter — your
signaling server, optional internal STUN/TURN — with **update checks disabled**. Empty or
invalid → shared boards stay **offline**, with *no silent fallback* to public servers. A
live *"What the app will contact"* recap, computed by the same function that opens the real
connections, proves it.

---

## 📥 Download & install

Grab the latest build from **[Releases](../../releases)**:

| File | Use case |
|---|---|
| `COSINT-Setup-x.y.z.exe` | Windows installer (Start menu, uninstaller, auto-update) |
| `COSINT-Portable-x.y.z.exe` | Windows portable — no install |
| `COSINT-x.y.z-x86_64.AppImage` | Linux portable |
| `COSINT-x.y.z-amd64.deb` | Debian/Ubuntu package |

### Launching what you downloaded

**Windows**
- **Installer** — run `COSINT-Setup-x.y.z.exe`, choose a folder, then start COSINT from the
  Start menu (or its desktop shortcut). Later updates install themselves.
- **Portable** — just double-click `COSINT-Portable-x.y.z.exe`; nothing gets installed.
- Not code-signed yet, so SmartScreen may warn *"Windows protected your PC"* →
  **More info** → **Run anyway** (first launch only).

**Linux**
- **AppImage** (portable, no install) — make it executable, then run it:
  ```bash
  chmod +x COSINT-x.y.z-x86_64.AppImage
  ./COSINT-x.y.z-x86_64.AppImage
  ```
  On a `libfuse.so.2` error, install FUSE (`sudo apt install libfuse2`) or run it with
  `--appimage-extract-and-run`.
- **Debian/Ubuntu** — install with apt (it pulls any dependency), then launch from your
  applications menu or the `cosint` command:
  ```bash
  sudo apt install ./COSINT-x.y.z-amd64.deb
  cosint
  ```
  Remove it later with `sudo apt remove cosint`.

Your data (boards, profile) lives in `%APPDATA%/COSINT` on Windows and `~/.config/COSINT`
on Linux — it survives updates and reinstalls.

## 🖧 Self-hosting the signaling server

The only server you may ever need is a ~140-line WebSocket relay
([`server/`](./server/README.md)) that introduces peers — it can't read anything. Node 18+:

```bash
cd server
npm install
PORT=4444 npm start        # → ws://your-host:4444
```

## 🛠️ Build from source

Requirements: Node.js ≥ 18, npm.

```bash
npm install
npm run dev          # development (hot reload)
npm run typecheck    # TypeScript checks
npm test             # unit + P2P integration tests (vitest)
npm run build:win    # Windows installer + portable → release/
npm run build:linux  # AppImage + .deb → release/
```

## 🧱 Tech stack

[Electron](https://www.electronjs.org/) · [React](https://react.dev/) ·
[React Flow](https://reactflow.dev/) · [Yjs](https://yjs.dev/) (CRDT) ·
[y-webrtc](https://github.com/yjs/y-webrtc) · y-indexeddb · Zustand · Vite · Vitest

## 🤝 Contributing

Issues and PRs are welcome — especially an **English UI dictionary**
(`src/renderer/src/i18n/`), documentation translations, and field reports from real
investigations. Architectural decisions are logged in [DECISIONS.md](./DECISIONS.md).

## 📄 License

[MIT](./LICENSE)
