<p align="center">
  <a href="./DEPLOY_LOCAL.md">English</a> · <a href="./DEPLOY_LOCAL.fr.md">Français</a> · <b>Polski</b>
</p>

# Wdrożenie COSINT w trybie w pełni lokalnym

Instalacja serwera sygnalizacyjnego COSINT w sieci zamkniętej oraz konfiguracja stanowisk
klienckich.

Sprawdzone na **Ubuntu 24.04 LTS** z **COSINT v1.8.8**. Do zastosowania w każdej dystrybucji
korzystającej z systemd.

### Wartości do podmiany

Polecenia w tym przewodniku używają znaczników, które należy zastąpić własnymi wartościami:

| Znacznik | Znaczenie | Przykład |
| --- | --- | --- |
| `<IP_SERWERA>` | Adres serwera sygnalizacyjnego | `10.0.0.20` |
| `<PODSIEC>/24` | Zakres uprawniony do łączenia się z serwerem | `10.0.0.0/24` |
| `<INTERFEJS>` | Interfejs sieciowy zwrócony do stanowisk | `eth0`, `enp3s0` |
| `<UZYTKOWNIK>` | Konto, na którym działa usługa | `cosint` |
| `<PORT>` | Port nasłuchu (`4444` w tym przewodniku) | `4444` |

Nazwy organizacji, podtytuły i kolory z przykładów również dostosuj do siebie.

---

## Spis treści

1. [Co instalujesz (a czego nie)](#1-co-instalujesz)
2. [Wymagania i przygotowanie sieci](#2-wymagania-i-przygotowanie-sieci)
3. [Instalacja serwera](#3-instalacja-serwera)
4. [Token dostępu](#4-token-dostępu)
5. [Usługa systemd](#5-usługa-systemd)
6. [Marka organizacji](#6-marka-organizacji)
7. [Zapora sieciowa](#7-zapora-sieciowa)
8. [Weryfikacja end-to-end](#8-weryfikacja-end-to-end)
9. [Konfiguracja stanowisk](#9-konfiguracja-stanowisk)
10. [Rozwiązywanie problemów](#10-rozwiązywanie-problemów)
11. [Codzienna eksploatacja](#11-codzienna-eksploatacja)

---

## 1. Co instalujesz

Serwer sygnalizacyjny to **przekaźnik WebSocket o około 140 liniach**, z jedną jedyną
zależnością (`ws`). Jego rolą jest wyłącznie przedstawienie uczestników sobie nawzajem.

| Element | Czy przechodzi przez serwer? |
| --- | --- |
| Zawartość tablic (encje, połączenia, obrazy) | **Nie** — bezpośrednio peer-to-peer, szyfrowane AES-GCM |
| Pseudonimy, kody udostępniania, sekrety sesji | **Nie** |
| Identyfikatory pokojów | Tak, ale wyprowadzone przez HKDF — nieodwracalne |
| Komunikaty nawiązywania połączenia | Tak, zaszyfrowane |

Praktyczny wniosek: **przejęcie serwera nie daje dostępu do żadnego śledztwa.** Kontrola
dostępu opisana niżej służy temu, by osoby trzecie nie *korzystały z Twojego przekaźnika*
i by zmniejszyć powierzchnię ataku — a nie ochronie danych, które kryptografia już chroni.

> **To nie jest baza danych.** Żadna tablica nie jest przechowywana po stronie serwera. Dane
> żyją w `~/.config/COSINT` (Linux) lub `%APPDATA%/COSINT` (Windows) na każdym stanowisku
> oraz w wyeksportowanych plikach `.trace`. Serwer niczego nie zapisuje: politykę kopii
> zapasowych zaplanuj po stronie stanowisk.

---

## 2. Wymagania i przygotowanie sieci

- Node.js **18 lub nowszy** (sprawdzone na v24)
- Dostęp `sudo` na maszynie serwera
- Stanowiska i serwer w **tej samej podsieci** lub trasowane między sobą

### Ustal adres serwera

```bash
ip -4 a | grep inet
```

Zanotuj IP interfejsu zwróconego do sieci stanowisk (`<INTERFEJS>`, `eth0`…).

### Ustal adres na stałe — nie pomijaj tego

Jeśli powyższy wynik zawiera `dynamic`, adres pochodzi z DHCP i **może się zmienić**. W dniu,
w którym się zmieni, wszystkie stanowiska naraz stracą serwer, a rozdany profil stanie się
nieaktualny.

Dwie opcje, w kolejności preferencji:

1. **Rezerwacja DHCP na routerze lub serwerze DHCP** (zalecane) — powiąż adres MAC interfejsu
   z żądanym IP. Odczytaj MAC poleceniem:
   ```bash
   cat /sys/class/net/<INTERFEJS>/address
   ```
2. **Adres statyczny** skonfigurowany na maszynie (Netplan, NetworkManager).

> **Kabel zamiast Wi-Fi.** Serwer sygnalizacyjny czasu rzeczywistego zyskuje na Ethernecie:
> stabilniejsze opóźnienia, brak przypadkowych rozłączeń, brak izolacji klientów Wi-Fi do
> obchodzenia.

---

## 3. Instalacja serwera

```bash
sudo apt update
sudo apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

Pobranie kodu i zależności:

```bash
sudo git clone https://github.com/k0nrd/COSINT.git /opt/cosint
cd /opt/cosint/server
sudo npm install --omit=dev
```

### Wybór konta usługi

Dwa podejścia — zdecyduj teraz, bo od tego zależą uprawnienia do `/opt/cosint`.

**Dedykowane konto systemowe (zalecane produkcyjnie)** — ogranicza szkody w razie przejęcia
usługi: brak powłoki, brak `sudo`, brak dostępu do plików osobistych.

```bash
sudo useradd -r -s /usr/sbin/nologin cosint
sudo chown -R cosint:cosint /opt/cosint
```

**Istniejące konto użytkownika** — prostsze w administracji (edycja plików, `scp` bez `sudo`).
Dopuszczalne dla przekaźnika wystawionego wyłącznie do wewnętrznej sieci LAN.

```bash
sudo chown -R <UZYTKOWNIK>:<UZYTKOWNIK> /opt/cosint
```

Zapamiętaj wybraną nazwę — trafi do pola `User=` usługi.

---

## 4. Token dostępu

Bez tokenu każda maszyna zdolna dosięgnąć portu może korzystać z Twojego przekaźnika.
Z `COSINT_TOKEN` serwer **odrzuca połączenie już przy nawiązywaniu**, zanim WebSocket
w ogóle się otworzy: odpowiedź HTTP 401, porównanie w czasie stałym. Stanowisko bez
właściwego tokenu nie widzi nic, nawet marki organizacji.

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

### Higiena tokenu

- **Nigdy go nie wklejaj** do zgłoszenia, czatu, e-maila ani zrzutu ekranu. Jeśli wyciekł,
  uznaj go za spalony i wygeneruj nowy.
- Nie zostawiaj go w historii powłoki: poprzedzaj zawierające go polecenia **spacją**
  (z `HISTCONTROL=ignorespace` w bashu, domyślnie w zsh po `setopt HIST_IGNORE_SPACE`).
- Token trafia do parametru `?token=` adresu URL. Przy `ws://` idzie **jawnym tekstem**:
  dopuszczalne w kontrolowanej sieci LAN, niedopuszczalne, gdy sieć przestaje być
  kontrolowana (zobacz [TLS](#jeśli-sieć-nie-jest-zaufana-tls)).

---

## 5. Usługa systemd

Uruchamianie serwera ręcznie wystarcza do testu, ale proces ginie wraz z zamknięciem sesji
SSH. Po udanym teście przejdź na systemd.

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
Environment=COSINT_TOKEN=DO_ZASTAPIENIA
ExecStart=/usr/bin/node signaling.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo chmod 600 /etc/systemd/system/cosint-signaling.service
sudo nano /etc/systemd/system/cosint-signaling.service   # wklej prawdziwy token
sudo systemctl daemon-reload
sudo systemctl enable --now cosint-signaling
```

Wykonanie `chmod 600` **przed** zapisaniem tokenu sprawia, że nie jest on czytelny dla
wszystkich, nawet przez chwilę.

### ⚠️ Pułapka: wartości ze spacjami

systemd dzieli wiersz `Environment=` po spacjach. Bez cudzysłowów wartość wielowyrazowa
zostaje ucięta, a reszta staje się nieprawidłowym przypisaniem, **po cichu ignorowanym**:

```ini
# ✘ ŹLE — daje „Twoja” i dwa błędy w dzienniku
Environment=COSINT_ORG_NAME=Twoja Organizacja

# ✔ POPRAWNIE — cudzysłowy obejmują całą parę KLUCZ=wartość
Environment="COSINT_ORG_NAME=Twoja Organizacja"
```

Apostrofy w środku nie sprawiają problemu. Po każdej zmianie:

```bash
sudo systemctl daemon-reload
sudo systemctl restart cosint-signaling
sudo journalctl -u cosint-signaling -n 10 --no-pager
```

Każdy wiersz `Invalid syntax, ignoring:` lub `Invalid environment assignment` oznacza
utraconą zmienną.

### Sprawdź, czy usługa działa

```bash
sudo systemctl status cosint-signaling
sudo ss -tlnp | grep 4444
```

> **Nie ufaj nazwie procesu.** Node 24 zmienia nazwę swojego wątku głównego na `MainThread`:
> `ss` i `systemctl` pokażą `MainThread`, a nie `node`. To nie jest inny program. Aby rozwiać
> wątpliwość:
> ```bash
> ps -o user,pid,args -p $(systemctl show -p MainPID --value cosint-signaling)
> ```

> **`journalctl` bez `sudo` może pokazać „No entries”**, jeśli Twoje konto nie należy ani do
> `adm`, ani do `systemd-journal` — mylący fałszywy negatyw. Zawsze używaj `sudo`.

---

## 6. Marka organizacji

W trybie w pełni lokalnym serwer może współoznaczyć ekran główny: logo, nazwa, podtytuł,
kolor akcentu. To **wyłącznie kosmetyka** — bez żadnego wpływu na szyfrowanie. Oznaczenie
nigdy nie pojawia się w trybie standardowym (serwery publiczne), a tożsamość „COSINT”
pozostaje widoczna obok Twojej.

| Zmienna | Rola | Ograniczenie |
| --- | --- | --- |
| `COSINT_ORG_NAME` | Wyświetlana nazwa — **wymagana**, aby włączyć markę | ≤ 60 znaków |
| `COSINT_ORG_SUBTITLE` | Podtytuł | ≤ 140 znaków |
| `COSINT_ORG_ACCENT` | Kolor akcentu | `#RRGGBB` |
| `COSINT_ORG_LOGO` | Ścieżka do logo | `.png` `.jpg` `.gif` `.webp` `.svg`, **≤ 300 KB** |

Dodaj je do bloku `[Service]` — zwróć uwagę na cudzysłowy przy wartościach ze spacjami:

```ini
Environment="COSINT_ORG_NAME=Twoja Organizacja"
Environment="COSINT_ORG_SUBTITLE=Twoje hasło lub komórka"
Environment=COSINT_ORG_ACCENT=#1b3a6b
Environment=COSINT_ORG_LOGO=/opt/cosint/server/logo.png
```

### Logo

Prześlij je ze stanowiska:

```bash
scp logo.png <UZYTKOWNIK>@<IP_SERWERA>:/opt/cosint/server/logo.png
```

**Sprawdź rozmiar — limit 300 KB jest twardy, a jego przekroczenie kończy się po cichu:**

```bash
ls -lh /opt/cosint/server/logo.png
```

Powyżej limitu skompresuj (z katalogu zawierającego plik):

```bash
cd /opt/cosint/server
cp logo.png logo-orig.png
convert logo-orig.png -resize 512x512\> -strip logo.png
ls -lh logo.png
```

Nadal za ciężkie? Zmniejsz paletę — bardzo skuteczne przy logotypach z płaskich plam, bez
widocznej straty:

```bash
convert logo-orig.png -resize 512x512\> -strip -colors 64 logo.png
```

Upewnij się, że konto usługi może odczytać plik:

```bash
sudo chown cosint:cosint /opt/cosint/server/logo.png
```

### Sprawdź efekt

```bash
sudo systemctl restart cosint-signaling
sudo journalctl -u cosint-signaling -n 3 --no-pager
```

Komunikat startowy pokazuje serwowaną markę. Jeśli nazwa jest **ucięta**, brakuje
cudzysłowów. Jeśli nie wspomina o logo: plik nieznaleziony, za ciężki, format odrzucony albo
nieczytelny dla konta usługi.

Po stronie aplikacji marka jest pobierana **przy otwarciu WebSocketu**: aby zobaczyć zmianę,
trzeba się połączyć ponownie (zamknąć i otworzyć aplikację lub przełączyć tryb w pełni
lokalny).

---

## 7. Zapora sieciowa

### Ustal, co filtruje

Nie zakładaj ufw: wiele serwerów używa bezpośrednio iptables/nftables.

```bash
sudo iptables -S INPUT
sudo nft list ruleset | grep -E 'policy|dport'
systemctl list-units --type=service --state=running | grep -iE 'firewall|nftables|fail2ban'
```

Jeśli widzisz `-P INPUT DROP`, polityką jest biała lista: **wszystko jest po cichu odrzucane
poza tym, co wprost dozwolone.** Niewymieniony port nie zwraca zupełnie nic — stąd *timeouty*,
a nie *connection refused*.

### Otwórz port

```bash
# ufw
sudo ufw allow from <PODSIEC>/24 to any port 4444 proto tcp

# iptables — dostosuj interfejs
sudo iptables -A INPUT -i <INTERFEJS> -s <PODSIEC>/24 -p tcp --dport 4444 -j ACCEPT

# natywne nftables
sudo nft add rule inet filter input ip saddr <PODSIEC>/24 tcp dport 4444 accept
```

> **Filtrowanie po adresie MAC: zachowaj dystans.** MAC podrabia się jednym poleceniem. Jako
> zabezpieczenie przed błędami konfiguracji — czemu nie; jako kontrola dostępu — nie.
> Prawdziwą kontrolą jest token. Otwarcie dla podsieci jest prostsze w utrzymaniu i nie
> osłabia modelu bezpieczeństwa.

### Uczyń regułę trwałą

**Reguła `iptables` znika po restarcie.** Sprawdź, co ją przywraca:

```bash
systemctl list-unit-files | grep -iE 'iptables|netfilter'
ls -l /etc/iptables/
```

Jeśli `netfilter-persistent` jest obecny:

```bash
sudo cp /etc/iptables/rules.v4 /etc/iptables/rules.v4.bak-$(date +%F)
sudo netfilter-persistent save
sudo grep 4444 /etc/iptables/rules.v4
```

W przeciwnym razie: `sudo apt install iptables-persistent`.

> **Jeśli na maszynie działa Docker**, `netfilter-persistent save` zamraża też łańcuchy
> `DOCKER-*`. Przy następnym starcie zostaną przywrócone, **a następnie** odtworzone przez
> Dockera → możliwe duplikaty. Rzadko blokujące, ale to pierwszy trop, gdy kontenery
> zachowują się dziwnie po restarcie. Czystsza alternatywa: przenieś regułę COSINT do
> dedykowanego skryptu wywoływanego przez jednostkę systemd, zamiast do globalnego zrzutu.

### Punkt często pomijany: IPv6

Polityka białej listy dla IPv4 jest bezwartościowa, jeśli IPv6 stoi otworem. Serwer nasłuchuje
na `*:4444`, a więc dual-stack.

```bash
sudo ip6tables -S INPUT
```

Jeśli widzisz `-P INPUT ACCEPT` bez reguł, Twoje filtrowanie da się obejść:

```bash
sudo ip6tables -P INPUT DROP
sudo ip6tables -A INPUT -i lo -j ACCEPT
sudo ip6tables -A INPUT -m state --state RELATED,ESTABLISHED -j ACCEPT
sudo netfilter-persistent save
```

> ⚠️ **Zostaw otwartą jedną sesję SSH** podczas tej operacji i sprawdź z drugiej sesji, czy
> nadal możesz się połączyć, **zanim** zamkniesz pierwszą. Zbyt restrykcyjna reguła IPv6 może
> odciąć Ci dostęp, jeśli Twoje SSH idzie po IPv6.

### Jeśli sieć nie jest zaufana: TLS

Przy `ws://` token i metadane idą jawnym tekstem. Za reverse proxy:

```bash
sudo apt install -y caddy
# /etc/caddy/Caddyfile
#   cosint.wewnetrzna.lan {
#       reverse_proxy localhost:4444
#   }
```

Stanowiska używają wtedy `wss://cosint.wewnetrzna.lan`, a na poziomie proxy możesz dodać
białą listę adresów IP, a nawet **mTLS** (certyfikat kliencki na stanowisko) dla
kontrolowanego parku maszyn.

---

## 8. Weryfikacja end-to-end

W tej kolejności — każdy krok izoluje inną warstwę.

**1. Usługa działa**

```bash
sudo systemctl status cosint-signaling
sudo ss -tlnp | grep 4444
```

**2. Odpowiada lokalnie** (testuje usługę, nie sieć)

```bash
nc -zvn -w 3 127.0.0.1 4444
```

**3. Odpowiada ze stanowiska** (testuje sieć i zaporę)

```bash
nc -zvn -w 3 <IP_SERWERA> 4444
```

`-n` zapobiega zbędnemu komunikatowi odwrotnego DNS, `-w 3` ucina oczekiwanie. W Windows:
`Test-NetConnection <IP_SERWERA> -Port 4444`.

**4. Konfiguracja przeżywa restart**

```bash
sudo systemctl reboot
# po powrocie:
sudo iptables -S INPUT | grep 4444
systemctl status cosint-signaling
sudo journalctl -u cosint-signaling -n 3 --no-pager
```

---

## 9. Konfiguracja stanowisk

### Konfiguracja ręczna

**Ustawienia → Sieć**:

| Pole | Wartość |
| --- | --- |
| Tryb w pełni lokalny | Włączony |
| Serwer sygnalizacyjny | `ws://<IP_SERWERA>:4444` |
| Token dostępu | Wygenerowany token |
| STUN / TURN | **Puste** |
| Zachowaj włączone aktualizacje | **Twoja decyzja** — patrz niżej |

**Dlaczego puste STUN/TURN:** w sieci LAN uczestnicy odnajdują się przez bezpośrednich
kandydatów hostowych — STUN służy wyłącznie do odkrycia publicznego IP, tu bezużytecznego.
W trybie w pełni lokalnym **nie ma cichego powrotu** do serwerów publicznych: puste lub
nieprawidłowe pole zostawia udostępnione tablice offline, bez obejścia.

> **⚠️ Nowość w v1.8.8 — sprawdzanie aktualizacji jest domyślnie WŁĄCZONE, także w trybie
> w pełni lokalnym.** Zbyt wiele stanowisk przełączonych na tryb lokalny tkwiło miesiącami
> na starej wersji, a nikt o tym nie wiedział. GitHub Releases staje się wtedy **jedyną**
> kontaktowaną usługą publiczną (żadne dane tablic przez nią nie przechodzą: pozostają
> zaszyfrowane między stanowiskami). **W sieci naprawdę odizolowanej odznacz „Zachowaj
> włączone aktualizacje”** — podsumowanie natychmiast wróci na zielone.

Podsumowanie „z czym skontaktuje się aplikacja” jest wyliczane przez tę samą funkcję, która
faktycznie otwiera połączenia: **musi dokładnie odzwierciedlać Twoją politykę.** To Twój
dowód izolacji — sprawdź je na każdym stanowisku.

### Konfiguracja automatyczna: plik `.cosint-org`

Zamiast kazać każdemu analitykowi wpisywać adres i token, rozdaj profil.

**Ze skonfigurowanego już stanowiska** — metoda wzorcowa:
**Ustawienia → Sieć → Profil organizacji → Eksportuj**.

**Albo wygeneruj go na serwerze.** Format to wersjonowany JSON; to polecenie wstrzykuje token,
nigdy go nie wyświetlając:

```bash
TOKEN=$(sudo grep -oP '(?<=COSINT_TOKEN=)\S+' /etc/systemd/system/cosint-signaling.service)

sudo tee /opt/cosint/organizacja.cosint-org > /dev/null <<EOF
{
  "cosintOrgProfile": 1,
  "signalingUrl": "ws://<IP_SERWERA>:4444",
  "token": "$TOKEN",
  "organization": "Twoja Organizacja"
}
EOF

sudo chmod 600 /opt/cosint/organizacja.cosint-org
unset TOKEN
```

Heredoc musi być **bez cudzysłowów** (`<<EOF`, a nie `<<'EOF'`), aby `$TOKEN` został
podstawiony. Zweryfikuj:

```bash
sudo node -e "console.log(JSON.parse(require('fs').readFileSync('/opt/cosint/organizacja.cosint-org','utf8')))"
```

Ograniczenia parsera: `cosintOrgProfile` musi wynosić `1`, `signalingUrl` musi być `ws://`
lub `wss://` (≤ 300 znaków), token ≤ 512, organizacja ≤ 60. Pole `organization` ma charakter
orientacyjny — faktycznie wyświetlana nazwa pochodzi z serwera.

**Na każdym stanowisku**: Ustawienia → Sieć → Profil organizacji → **Importuj**, sprawdź,
zapisz. Tryb w pełni lokalny, adres i token są ustawione za jednym razem; logo i tytuł
przychodzą z serwera przy połączeniu.

> **Ten plik zawiera token jawnym tekstem.** Rozdawaj go pendrivem lub przez udział
> wewnętrzny, nigdy e-mailem ani komunikatorem konsumenckim. Traktuj go jak sekret:
> `chmod 600`, a po imporcie usuń ze stanowisk, jeśli wymaga tego Twoja polityka.

---

## 10. Rozwiązywanie problemów

### Odczytywanie objawu sieciowego

| Objaw | Interpretacja |
| --- | --- |
| **Natychmiastowe** `Connection refused` | Port osiągnięty, ale nic nie nasłuchuje → usługa zatrzymana lub padła |
| `Connection timed out` | Pakiety po cichu odrzucane → zapora w `DROP` albo maszyna nieosiągalna |
| Ping nie działa, ale SSH tak | Normalne: ICMP niedozwolony. Nie wyciągaj wniosku, że maszyna jest wyłączona |
| OK na `127.0.0.1`, timeout ze stanowiska | Usługa działa, blokuje zapora |
| Brak wpisu ARP (`ip neigh`) dla celu | Maszyna wyłączona, IP zmienione… albo po prostu filtrowana |

`DROP` nie zwraca nic: klient ponawia, po czym rezygnuje — stąd *timeout*. `REJECT`
odpowiedziałby natychmiast. Ta różnica to Twoja najlepsza wskazówka.

### Częste problemy

**Serwer startuje i natychmiast się zatrzymuje**
```bash
sudo journalctl -u cosint-signaling -n 30 --no-pager
```
Szukaj `EADDRINUSE`: port jest już zajęty. Zmień go w usłudze albo zwolnij.

**Marka pokazuje uciętą nazwę** — brak cudzysłowów w `Environment=`. Zobacz
[§5](#️-pułapka-wartości-ze-spacjami).

**Logo się nie pojawia** — po kolei: rozmiar > 300 KB, błędna ścieżka, nieobsługiwany format,
plik nieczytelny dla konta usługi albo aplikacja nie połączyła się ponownie.

**Stanowisko się nie łączy, choć port odpowiada** — brak tokenu lub błędny token. Odmowa
następuje przed otwarciem WebSocketu: stanowisko nie widzi ani marki, ani szczegółowego
komunikatu błędu.

**Podsumowanie wspomina GitHub, choć sieć jest odizolowana** — od v1.8.8 sprawdzanie
aktualizacji pozostaje domyślnie włączone w trybie w pełni lokalnym. Odznacz „Zachowaj
włączone aktualizacje” (Ustawienia → Sieć).

**Wszystko działało, po restarcie nic** — reguły zapory nieutrwalone albo IP serwera zmienione
przez DHCP.

**`git clone` lub `npm install` odrzucone w `/opt`** — uprawnienia. Użyj `sudo` albo zainstaluj
w katalogu, który należy do Ciebie.

**Dwie maszyny w tej samej podsieci w ogóle się nie widzą** — izolacja klientów Wi-Fi
(„client isolation”, „AP isolation”) włączona na routerze. Wyłącz ją albo przejdź na kabel.

---

## 11. Codzienna eksploatacja

### Dziennik na żywo

```bash
sudo journalctl -u cosint-signaling -f
```

### Odbierz dostęp wszystkim stanowiskom

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
sudo nano /etc/systemd/system/cosint-signaling.service
sudo systemctl daemon-reload && sudo systemctl restart cosint-signaling
```

Następnie wygeneruj ponownie `.cosint-org` i rozdaj go na nowo. Każde stanowisko trzymające
stary token zostanie odrzucone.

### Aktualizacja COSINT

```bash
cd /opt/cosint
sudo git pull
cd server && sudo npm install --omit=dev
sudo systemctl restart cosint-signaling
```

Następnie sprawdź informacje o wydaniu: format `.cosint-org` jest wersjonowany
(`cosintOrgProfile: 1`) i może ewoluować.

### Sprawdź aktywny token

```bash
# wartość skonfigurowana
sudo grep COSINT_TOKEN /etc/systemd/system/cosint-signaling.service

# wartość faktycznie wczytana przez proces
sudo tr '\0' '\n' < /proc/$(systemctl show -p MainPID --value cosint-signaling)/environ | grep COSINT_TOKEN
```

Różnica między nimi oznacza zapomniany `daemon-reload` lub `restart`.

---

## Lista kontrolna

- [ ] Node ≥ 18 zainstalowany
- [ ] Repozytorium sklonowane, `npm install` wykonany
- [ ] IP serwera ustalone na stałe (rezerwacja DHCP)
- [ ] Konto usługi wybrane, uprawnienia dostosowane
- [ ] Token wygenerowany i nigdy nieujawniony
- [ ] Usługa systemd aktywna i włączona przy starcie
- [ ] Żadnego wiersza `Invalid` w dzienniku
- [ ] Marka wyświetlana w całości, logo < 300 KB
- [ ] Port otwarty dla podsieci
- [ ] Reguły zapory trwałe
- [ ] IPv6 obsłużone
- [ ] Test `nc` udany ze stanowiska
- [ ] Restart zweryfikowany
- [ ] `.cosint-org` wygenerowany i bezpiecznie rozdany
- [ ] Polityka aktualizacji rozstrzygnięta (włączona lub odznaczona w sieci odizolowanej)
- [ ] Podsumowanie „z czym skontaktuje się aplikacja” sprawdzone na każdym stanowisku

---

*Na podstawie COSINT v1.8.8 — https://github.com/k0nrd/COSINT*
