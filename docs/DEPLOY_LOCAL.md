<p align="center">
  <b>English</b> · <a href="./DEPLOY_LOCAL.fr.md">Français</a> · <a href="./DEPLOY_LOCAL.pl.md">Polski</a>
</p>

# Deploying COSINT in 100 % local mode

How to install a COSINT signalling server on a closed network, and provision the client
workstations.

Tested on **Ubuntu 24.04 LTS** with **COSINT v1.8.9**. Adaptable to any distribution that
ships systemd.

### Placeholders to replace

The commands in this guide use markers you must substitute with your own values:

| Marker | Meaning | Example |
| --- | --- | --- |
| `<SERVER_IP>` | Address of the signalling server | `10.0.0.20` |
| `<SUBNET>/24` | Range allowed to reach the server | `10.0.0.0/24` |
| `<INTERFACE>` | Network interface facing the workstations | `eth0`, `enp3s0` |
| `<USER>` | Account the service runs as | `cosint` |
| `<PORT>` | Listening port (`4444` throughout this guide) | `4444` |

The organization names, subtitles and colours in the examples are yours to adapt too.

---

## Contents

1. [What you are installing (and what you are not)](#1-what-you-are-installing)
2. [Prerequisites and network preparation](#2-prerequisites-and-network-preparation)
3. [Installing the server](#3-installing-the-server)
4. [Access token](#4-access-token)
5. [systemd service](#5-systemd-service)
6. [Organization branding](#6-organization-branding)
7. [Firewall](#7-firewall)
8. [End-to-end verification](#8-end-to-end-verification)
9. [Provisioning the workstations](#9-provisioning-the-workstations)
10. [Troubleshooting](#10-troubleshooting)
11. [Day-to-day operation](#11-day-to-day-operation)

---

## 1. What you are installing

The signalling server is a **WebSocket relay of about 140 lines**, with a single dependency
(`ws`). Its only job is to introduce peers to each other.

| Item | Does it pass through the server? |
| --- | --- |
| Board content (entities, links, images) | **No** — directly peer to peer, AES-GCM encrypted |
| Nicknames, share codes, session secrets | **No** |
| Room identifiers | Yes, but HKDF-derived — not reversible |
| Peer-introduction messages | Yes, encrypted |

Practical consequence: **compromising the server grants access to no investigation.** The
access control described below exists to stop third parties from *using your relay* and to
reduce the attack surface — not to protect the data, which cryptography already protects.

> **This is not a database.** No board is stored server-side. Data lives in
> `~/.config/COSINT` (Linux) or `%APPDATA%/COSINT` (Windows) on each workstation, and in
> exported `.trace` files. The server saves nothing: plan your backup policy on the
> workstation side.

---

## 2. Prerequisites and network preparation

- Node.js **18 or later** (tested on v24)
- `sudo` access on the server machine
- Workstations and server on the **same subnet**, or routed to each other

### Find the server address

```bash
ip -4 a | grep inet
```

Note the IP of the interface facing the workstation network (`<INTERFACE>`, `eth0`…).

### Pin the address — or let COSINT handle it

If the previous output says `dynamic`, the address comes from DHCP and **can change**.

> **✅ Since 1.8.9 this is no longer a blocker.** Every workstation checks the saved address
> at startup and, if it no longer answers, **finds the server again by itself** on the local
> network — see [§ Automatic discovery](#automatic-discovery-dhcp-server). No more rebuilding
> a profile every morning.

Pinning the address is still **preferable** (instant reconnection, no sweep, a `.cosint-org`
profile that stays valid indefinitely). Two options, in order of preference:

1. **DHCP reservation on the router or DHCP server** (recommended) — tie the interface's
   MAC address to the IP you want. Read the MAC with:
   ```bash
   cat /sys/class/net/<INTERFACE>/address
   ```
2. **Static address** configured on the machine (Netplan, NetworkManager).

> **Wired rather than Wi-Fi.** A real-time signalling server benefits from Ethernet: steadier
> latency, no spurious reconnections, no Wi-Fi client isolation to work around.

---

## 3. Installing the server

```bash
sudo apt update
sudo apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

Fetch the code and its dependencies:

```bash
sudo git clone https://github.com/k0nrd/COSINT.git /opt/cosint
cd /opt/cosint/server
sudo npm install --omit=dev
```

### Choosing the service account

Two approaches, to settle now because it determines the ownership of `/opt/cosint`.

**Dedicated system account (recommended in production)** — limits the damage if the service
is compromised: no shell, no `sudo`, no access to personal files.

```bash
sudo useradd -r -s /usr/sbin/nologin cosint
sudo chown -R cosint:cosint /opt/cosint
```

**Existing user account** — simpler to administer (editing files, `scp` without `sudo`).
Acceptable for a relay exposed only to the internal LAN.

```bash
sudo chown -R <USER>:<USER> /opt/cosint
```

Remember the name you picked — it goes into the service's `User=` field.

---

## 4. Access token

Without a token, any machine able to reach the port can use your relay. With
`COSINT_TOKEN`, the server **refuses the connection at the handshake**, before the WebSocket
even opens: HTTP 401 response, constant-time comparison. A workstation without the right
token sees nothing at all, not even the organization branding.

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

### Token hygiene

- **Never paste it** into a ticket, a chat, an e-mail or a screenshot. If it leaked,
  consider it burnt and regenerate it.
- Keep it out of your shell history: prefix commands containing it with a **space** (with
  `HISTCONTROL=ignorespace` under bash, on by default under zsh with
  `setopt HIST_IGNORE_SPACE`).
- The token travels as the `?token=` URL parameter. Over `ws://` it goes **in clear text**:
  acceptable on a LAN you control, to be avoided as soon as you do not
  (see [TLS](#if-the-network-is-not-trusted-tls)).

---

## 5. systemd service

Running the server by hand is fine for a test, but the process dies when the SSH session
closes. Move to systemd as soon as the test succeeds.

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
Environment=COSINT_TOKEN=REPLACE_ME
ExecStart=/usr/bin/node signaling.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo chmod 600 /etc/systemd/system/cosint-signaling.service
sudo nano /etc/systemd/system/cosint-signaling.service   # paste the real token
sudo systemctl daemon-reload
sudo systemctl enable --now cosint-signaling
```

Doing `chmod 600` **before** writing the token stops it from being world-readable, even for
an instant.

### ⚠️ Trap: values containing spaces

systemd splits the `Environment=` line on spaces. Without quotes, a multi-word value is
truncated and the remainder becomes an invalid assignment, **silently ignored**:

```ini
# ✘ WRONG — yields "Your" and two errors in the journal
Environment=COSINT_ORG_NAME=Your Organization

# ✔ CORRECT — the quotes wrap the whole KEY=value pair
Environment="COSINT_ORG_NAME=Your Organization"
```

Apostrophes inside cause no trouble. After every change:

```bash
sudo systemctl daemon-reload
sudo systemctl restart cosint-signaling
sudo journalctl -u cosint-signaling -n 10 --no-pager
```

Any `Invalid syntax, ignoring:` or `Invalid environment assignment` line means a lost
variable.

### Check that the service is running

```bash
sudo systemctl status cosint-signaling
sudo ss -tlnp | grep 4444
```

> **Do not trust the process name.** Node 24 renames its main thread to `MainThread`: `ss`
> and `systemctl` will show `MainThread`, not `node`. It is not another program. To settle
> the doubt:
> ```bash
> ps -o user,pid,args -p $(systemctl show -p MainPID --value cosint-signaling)
> ```

> **`journalctl` without `sudo` may print "No entries"** if your account belongs to neither
> `adm` nor `systemd-journal` — a misleading false negative. Always use `sudo`.

---

## 6. Organization branding

In 100 % local mode, the server can co-brand the home screen: logo, name, subtitle, accent
colour. This is **purely cosmetic** — no effect on encryption whatsoever. The branding never
appears in standard mode (public servers), and the "COSINT" identity stays visible next to
yours.

| Variable | Role | Constraint |
| --- | --- | --- |
| `COSINT_ORG_NAME` | Displayed name — **required** to enable branding | ≤ 60 characters |
| `COSINT_ORG_SUBTITLE` | Subtitle | ≤ 140 characters |
| `COSINT_ORG_ACCENT` | Accent colour | `#RRGGBB` |
| `COSINT_ORG_LOGO` | Path to a logo | `.png` `.jpg` `.gif` `.webp` `.svg`, **≤ 300 KB** |

Add these to the `[Service]` block — note the quotes on values with spaces:

```ini
Environment="COSINT_ORG_NAME=Your Organization"
Environment="COSINT_ORG_SUBTITLE=Your tagline or unit"
Environment=COSINT_ORG_ACCENT=#1b3a6b
Environment=COSINT_ORG_LOGO=/opt/cosint/server/logo.png
```

### The logo

Transfer it from a workstation:

```bash
scp logo.png <USER>@<SERVER_IP>:/opt/cosint/server/logo.png
```

**Check the size — the 300 KB limit is strict and going over it fails silently:**

```bash
ls -lh /opt/cosint/server/logo.png
```

Beyond that, compress it (from the folder containing the file):

```bash
cd /opt/cosint/server
cp logo.png logo-orig.png
convert logo-orig.png -resize 512x512\> -strip logo.png
ls -lh logo.png
```

Still too heavy? Reduce the palette — very effective on flat-colour logos, with no visible
loss:

```bash
convert logo-orig.png -resize 512x512\> -strip -colors 64 logo.png
```

Make sure the service account can read the file:

```bash
sudo chown cosint:cosint /opt/cosint/server/logo.png
```

### Check the result

```bash
sudo systemctl restart cosint-signaling
sudo journalctl -u cosint-signaling -n 3 --no-pager
```

The startup message reports the branding being served. If it shows a **truncated** name,
quotes are missing. If it mentions no logo: file not found, too heavy, format refused, or
unreadable by the service account.

On the application side, branding is fetched **when the WebSocket opens**: you must
reconnect (close/reopen the app, or toggle 100 % local mode off and on) to see it change.

---

## 7. Firewall

### Identify what is filtering

Do not assume ufw: plenty of servers use iptables/nftables directly.

```bash
sudo iptables -S INPUT
sudo nft list ruleset | grep -E 'policy|dport'
systemctl list-units --type=service --state=running | grep -iE 'firewall|nftables|fail2ban'
```

If you read `-P INPUT DROP`, the policy is allow-list: **everything is silently rejected
except what is explicitly permitted.** An unlisted port returns nothing at all, hence
*timeouts* rather than *connection refused*.

### Open the port

```bash
# ufw
sudo ufw allow from <SUBNET>/24 to any port 4444 proto tcp

# iptables — adapt the interface
sudo iptables -A INPUT -i <INTERFACE> -s <SUBNET>/24 -p tcp --dport 4444 -j ACCEPT

# native nftables
sudo nft add rule inet filter input ip saddr <SUBNET>/24 tcp dport 4444 accept
```

> **MAC address filtering: keep it in perspective.** A MAC is spoofed with one command. As a
> guard rail against configuration mistakes, why not; as access control, no. The real
> control is the token. Opening to the subnet is simpler to maintain and does not weaken the
> security model.

### Make the rule persistent

**An `iptables` rule disappears on reboot.** Check what restores them:

```bash
systemctl list-unit-files | grep -iE 'iptables|netfilter'
ls -l /etc/iptables/
```

If `netfilter-persistent` is present:

```bash
sudo cp /etc/iptables/rules.v4 /etc/iptables/rules.v4.bak-$(date +%F)
sudo netfilter-persistent save
sudo grep 4444 /etc/iptables/rules.v4
```

Otherwise: `sudo apt install iptables-persistent`.

> **If Docker runs on the machine**, `netfilter-persistent save` also freezes the `DOCKER-*`
> chains. On the next boot they will be restored **and then** recreated by Docker →
> possible duplicates. Rarely blocking, but it is the first thing to look at if your
> containers misbehave after a reboot. Cleaner alternative: carry the COSINT rule in a
> dedicated script called by a systemd unit, rather than in the global dump.

### The commonly forgotten point: IPv6

An IPv4 allow-list policy is worthless if IPv6 is wide open. The server listens on `*:4444`,
so dual-stack.

```bash
sudo ip6tables -S INPUT
```

If you read `-P INPUT ACCEPT` with no rules, your filtering can be bypassed:

```bash
sudo ip6tables -P INPUT DROP
sudo ip6tables -A INPUT -i lo -j ACCEPT
sudo ip6tables -A INPUT -m state --state RELATED,ESTABLISHED -j ACCEPT
sudo netfilter-persistent save
```

> ⚠️ **Keep one SSH session open** during the operation and check from a second session that
> you can still connect **before** closing the first. An over-strict IPv6 rule can lock you
> out if your SSH goes over IPv6.

### If the network is not trusted: TLS

Over `ws://`, the token and the metadata travel in clear text. Behind a reverse proxy:

```bash
sudo apt install -y caddy
# /etc/caddy/Caddyfile
#   cosint.internal.lan {
#       reverse_proxy localhost:4444
#   }
```

Workstations then use `wss://cosint.internal.lan`, and you can add an IP allow-list at the
proxy level, or even **mTLS** (a client certificate per workstation) for a managed fleet.

---

## 8. End-to-end verification

In this order — each step isolates a different layer.

**1. The service is running**

```bash
sudo systemctl status cosint-signaling
sudo ss -tlnp | grep 4444
```

**2. It answers locally** (tests the service, not the network)

```bash
nc -zvn -w 3 127.0.0.1 4444
```

**3. It answers from a workstation** (tests the network and the firewall)

```bash
nc -zvn -w 3 <SERVER_IP> 4444
```

`-n` avoids a spurious reverse-DNS message, `-w 3` caps the wait. On Windows:
`Test-NetConnection <SERVER_IP> -Port 4444`.

**4. The configuration survives a reboot**

```bash
sudo systemctl reboot
# once back:
sudo iptables -S INPUT | grep 4444
systemctl status cosint-signaling
sudo journalctl -u cosint-signaling -n 3 --no-pager
```

---

## 9. Provisioning the workstations

### Manual configuration

**Settings → Network**:

| Field | Value |
| --- | --- |
| 100 % local mode | Enabled |
| Signalling server | `ws://<SERVER_IP>:4444` |
| Access token | The token you generated |
| STUN / TURN | **Empty** |
| Find the server again automatically | **Ticked** (recommended under DHCP) |
| Keep updates enabled | **Your call** — see below |

**Why empty STUN/TURN:** on a LAN, peers find each other through direct host candidates —
STUN only exists to discover a public IP, which is pointless here. In 100 % local mode there
is **no silent fallback** to public servers: an empty or invalid field leaves shared boards
offline, with no workaround.

> **⚠️ New in v1.8.8 — update checking is ON by default, even in 100 % local mode.** Too
> many stations switched to local mode stayed stuck on an old version for months without
> anyone noticing. GitHub Releases then becomes the **only** public service contacted (no
> board data passes through it: it stays encrypted between workstations). **On a genuinely
> isolated network, untick "Keep updates enabled"** — the recap turns green again
> immediately.

The "what the app will contact" recap is computed by the very function that opens the real
connections: **it must mirror your policy exactly.** That is your proof of isolation — check
it on every workstation.

### Automatic discovery (DHCP server)

**The problem.** Under DHCP the server's address changes — often every night. Up to 1.8.8
you had to read the new address, rebuild a `.cosint-org` and re-import it on every
workstation. Every morning.

**What 1.8.9 does.** The server publishes an **identity fingerprint** on `GET /cosint`,
unauthenticated:

```bash
curl -s http://<SERVER_IP>:4444/cosint
# {"cosint":1,"id":"069dc41621ee0610c845dcd3912ccc2b"}
```

That fingerprint is a truncated `sha256("cosint-discovery-v1:" + COSINT_TOKEN)`. It is also
printed when the service starts:

```bash
sudo journalctl -u cosint-signaling -n 3 --no-pager
# Découverte automatique : GET /cosint → empreinte 069dc41621ee0610c845dcd3912ccc2b.
```

Each workstation derives the **same** fingerprint from the token it holds, then:

1. checks the saved address — one request, and in the common case that is the end of it;
2. if it no longer answers, **sweeps its own private subnets** on the configured port only;
3. accepts **only** the server whose fingerprint matches, and rewrites its address.
   A message says so: "Server found again — new address …".

**Why this is safe.** The fingerprint proves knowledge of the token **without revealing it**
(the token from this guide is 24 random bytes: not brute-forceable). The workstation sends
its token **only after** it has identified the right server, so a rogue server on the same
network can neither impersonate yours nor be handed the token. Nothing else is exposed —
not the organization name, not the logo, not the rooms: branding stays behind the token
check.

> **⚠️ Without `COSINT_TOKEN` the fingerprint is a constant**: any open COSINT server on the
> network matches. Discovery becomes a convenience rather than a guarantee — one more reason
> to set a token.

**What gets swept, and nothing else:** the **private** ranges of the workstation's own
interfaces (at most one /24 per interface, 3 interfaces), on the **single port** already
configured. Never a public range, never another port.

**The setting** — Settings → Network → *Server discovery*: "Find the server again
automatically if its address changes" is **ticked by default**, and the **Search** button
forces an immediate lookup (handy right after entering a token).

On a workstation **outside the network** (at home, on another site) no fingerprint matches:
nothing moves, the workstation simply stays offline. That is the intended behaviour.

> **The server must run 1.8.9 or later.** An earlier server does not answer on `/cosint`:
> discovery fails silently and the address still has to be entered by hand. Updating: see
> [§11](#11-day-to-day-operation).

### Automatic provisioning: the `.cosint-org` file

Rather than having every analyst type the address and the token, hand out a profile.

**From an already configured workstation** — the reference method:
**Settings → Network → Organization profile → Export**.

**Or generate it on the server.** The format is versioned JSON; this command injects the
token without ever displaying it:

```bash
TOKEN=$(sudo grep -oP '(?<=COSINT_TOKEN=)\S+' /etc/systemd/system/cosint-signaling.service)

sudo tee /opt/cosint/organization.cosint-org > /dev/null <<EOF
{
  "cosintOrgProfile": 1,
  "signalingUrl": "ws://<SERVER_IP>:4444",
  "token": "$TOKEN",
  "organization": "Your Organization"
}
EOF

sudo chmod 600 /opt/cosint/organization.cosint-org
unset TOKEN
```

The heredoc must be **unquoted** (`<<EOF`, not `<<'EOF'`) for `$TOKEN` to be substituted.
Verify:

```bash
sudo node -e "console.log(JSON.parse(require('fs').readFileSync('/opt/cosint/organization.cosint-org','utf8')))"
```

Parser constraints: `cosintOrgProfile` must equal `1`, `signalingUrl` must be `ws://` or
`wss://` (≤ 300 characters), token ≤ 512, organization ≤ 60. The `organization` field is
indicative only — the name actually displayed comes from the server.

**On each workstation**: Settings → Network → Organization profile → **Import**, review,
save. 100 % local mode, address and token are set in one go; logo and title arrive from the
server on connection.

> **This file contains the token in clear text.** Distribute it by USB key or internal
> share, never by e-mail or consumer messaging. Treat it as a secret: `chmod 600`, and
> delete it from the workstations after import if your policy requires it.

---

## 10. Troubleshooting

### Reading the network symptom

| Symptom | Interpretation |
| --- | --- |
| **Immediate** `Connection refused` | The port is reached, but nothing listens → service stopped or crashed |
| `Connection timed out` | Packets silently dropped → firewall in `DROP`, or machine unreachable |
| Ping fails but SSH works | Normal: ICMP is not allowed. Do not conclude the machine is off |
| OK on `127.0.0.1`, timeout from a workstation | The service is fine, the firewall is blocking |
| No ARP entry (`ip neigh`) for the target | Machine off, IP changed… or simply filtered |

`DROP` returns nothing: the client retries then gives up, hence the *timeout*. `REJECT`
would answer immediately. That difference is your best clue.

### Common problems

**The server starts then stops immediately**
```bash
sudo journalctl -u cosint-signaling -n 30 --no-pager
```
Look for `EADDRINUSE`: the port is already taken. Change it in the service, or free it.

**The branding shows a truncated name** — missing quotes on `Environment=`. See
[§5](#️-trap-values-containing-spaces).

**The logo does not appear** — in order: size > 300 KB, wrong path, unsupported format, file
unreadable by the service account, or the app has not reconnected.

**A workstation will not connect although the port answers** — missing or wrong token. The
refusal happens before the WebSocket opens: the station sees neither the branding nor a
detailed error message.

**The recap mentions GitHub although the network is isolated** — since v1.8.8, update
checking stays on by default in 100 % local mode. Untick "Keep updates enabled"
(Settings → Network).

**Everything worked, nothing does after a reboot** — firewall rules not persisted, or the
server IP changed by DHCP (automatic discovery should then find it again: check the server
runs 1.8.9 or later).

**Automatic discovery does not find the server** — in order: server older than 1.8.9
(`curl http://<SERVER_IP>:4444/cosint` must return JSON); token mismatch between workstation
and server (the fingerprints differ); workstation on a different network than the server;
firewall blocking the port from the workstation; Wi-Fi client isolation. The **Search**
button in Settings gives immediate feedback.

**`git clone` or `npm install` refused in `/opt`** — permissions. Use `sudo`, or install into
a directory you own.

**Two machines on the same subnet cannot see each other at all** — Wi-Fi client isolation
("client isolation", "AP isolation") enabled on the router. Disable it, or go wired.

---

## 11. Day-to-day operation

### Live log

```bash
sudo journalctl -u cosint-signaling -f
```

### Revoke access for every workstation

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
sudo nano /etc/systemd/system/cosint-signaling.service
sudo systemctl daemon-reload && sudo systemctl restart cosint-signaling
```

Then regenerate the `.cosint-org` and redistribute it. Any workstation keeping the old token
is refused.

### Update COSINT

```bash
cd /opt/cosint
sudo git pull
cd server && sudo npm install --omit=dev
sudo systemctl restart cosint-signaling
```

Then check the release notes: the `.cosint-org` format is versioned
(`cosintOrgProfile: 1`) and could evolve.

### Inspect the active token

```bash
# configured value
sudo grep COSINT_TOKEN /etc/systemd/system/cosint-signaling.service

# value actually loaded by the process
sudo tr '\0' '\n' < /proc/$(systemctl show -p MainPID --value cosint-signaling)/environ | grep COSINT_TOKEN
```

A difference between the two means a forgotten `daemon-reload` or `restart`.

---

## Checklist

- [ ] Node ≥ 18 installed
- [ ] Repository cloned, `npm install` done
- [ ] Server IP pinned (DHCP reservation) — or automatic discovery verified
- [ ] Service account chosen, ownership adjusted
- [ ] Token generated and never disclosed
- [ ] systemd service active and enabled at boot
- [ ] No `Invalid` line in the journal
- [ ] Branding displayed in full, logo < 300 KB
- [ ] Port open to the subnet
- [ ] Firewall rules persistent
- [ ] IPv6 handled
- [ ] `nc` test conclusive from a workstation
- [ ] Reboot validated
- [ ] `.cosint-org` generated and distributed safely
- [ ] Update policy decided (enabled, or unticked for an isolated network)
- [ ] "What the app will contact" recap checked on every workstation

---

*Based on COSINT v1.8.9 — https://github.com/k0nrd/COSINT*
