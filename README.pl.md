<p align="center">
  <img src="docs/assets/bannerpng.png" alt="COSINT — wspólna tablica śledcza OSINT" width="100%">
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.fr.md">Français</a> · <b>Polski</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/wersja-1.8.6-06b6d4" alt="Wersja">
  <img src="https://img.shields.io/badge/licencja-MIT-3fbf6a" alt="Licencja">
  <img src="https://img.shields.io/badge/platforma-Windows%20·%20Linux-8b5cf6" alt="Platforma">
  <img src="https://img.shields.io/badge/testy-253%20zielone-3fbf6a" alt="Testy">
  <img src="https://img.shields.io/badge/telemetria-brak-ef4444" alt="Brak telemetrii">
  <img src="https://img.shields.io/badge/Electron%20·%20React%20·%20Yjs-1f2937" alt="Zbudowano z">
</p>

<p align="center">
  <i>Mapuj jednostki, łącz je, dołączaj źródła i buduj sprawę wizualnie —<br>
  samodzielnie lub w czasie rzeczywistym ze współpracownikami, bez danych trafiających kiedykolwiek na serwer.</i>
</p>

---

## ✨ Czym jest COSINT?

**COSINT** to desktopowa **tablica śledcza do pracy OSINT**. Umieszczaj jednostki na kanwie
(osoby, konta, numery telefonów, domeny, adresy IP, portfele krypto, pojazdy, wydarzenia,
miejsca…), łącz je, oceniaj i dołączaj źródła, i obserwuj, jak sprawa nabiera kształtu —
**samodzielnie lub wspólnie w czasie rzeczywistym**.

Sedno: **nie ma żadnego zaplecza serwerowego.** Uczestnicy synchronizują się **bezpośrednio**,
z szyfrowaniem od końca do końca, a treść tablic nigdy nie trafia na żaden serwer — nawet
w postaci zaszyfrowanej kopii.

> 🌍 **Trójjęzyczny:** interfejs jest dostępny w językach **francuskim, angielskim i polskim**.
> Wybierz język przy pobieraniu/instalacji (selektor instalatora) lub w dowolnej chwili
> w **Ustawienia → Wygląd**; domyślnie zgodnie z językiem systemu.

<table>
<tr>
<td width="50%" valign="top">

### 🔒 Prywatny z założenia
Bez konta, bez chmury, bez telemetrii. Treść płynie **od uczestnika do uczestnika** przez
WebRTC, **szyfrowana od końca do końca (AES-GCM)**, z kluczem, który nigdy nie opuszcza Twoich komputerów.

</td>
<td width="50%" valign="top">

### 🧭 Stworzony do realnej pracy śledczej
~90 typów jednostek, oceniane źródła (skala Admiralicji), odznaki statusu, bogate połączenia,
dwie osie czasu, eksport CSV/PNG/`.trace`, własne typy jednostek dla każdej tablicy.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🌐 Na Twój sposób
Online w czasie rzeczywistym, **całkowicie offline** lub w trybie **w pełni lokalnym**, który
kontaktuje *tylko* skonfigurowane serwery wewnętrzne — z dowodem na żywo, z czym się łączy.

</td>
<td width="50%" valign="top">

### 🧩 Brak uwięzienia
Wszystko jest przenośnym plikiem `.trace` (JSON) na Twoim dysku. Kopiuj węzły, obrazy i całe
podgrafy do schowka i wklejaj je gdziekolwiek.

</td>
</tr>
</table>

---

## 🚀 Nowości w 1.8.6

- **🌍 Trójjęzyczny — francuski, angielski i polski** — cały interfejs jest przetłumaczony;
  wybierz język przy pobieraniu/instalacji (selektor języka instalatora) lub w
  **Ustawienia → Wygląd**. Nowe instalacje przyjmują język systemu.
- **🧵 Linie odniesienia na osi czasu** — cienkie nici łączą teraz każdy pasek wydarzenia
  (oba końce przedziału lub czasu trwania) z jego **datą u góry, na osi**.
- **🗓️ Datowane dodawanie, na trzy sposoby** — dodawanie elementu z osi czasu oferuje teraz
  **dokładną datę, czas trwania lub przedział niepewności** — nie tylko dokładną datę.
- **🖱️ Poprawki i wskazówki na osi czasu** — koniec z przypadkowym zaznaczaniem tekstu przy
  zmianie rozmiaru pasków; dyskretna wskazówka *„Przytrzymaj [Ctrl], aby …”* pojawia się przy
  przeciąganiu bez modyfikatora, a ten **klawisz przytrzymania jest konfigurowalny**
  (Ustawienia → Skróty).
- **🔗 Czystsze rysowanie połączeń** — podczas rysowania ścieżki połączenia nie można już
  przypadkowo **zaznaczyć strefy** pod spodem.
- **🔄 Aktualizacje w trybie w pełni lokalnym** — opcjonalne pole *„zachowaj włączone
  aktualizacje”* pozwala w pełni lokalnym instalacjom nadal sprawdzać GitHub (podsumowanie
  uczciwie sygnalizuje ten kontakt publiczny).
- **🎛️ Odświeżone pierwsze uruchomienie i ustawienia** — czystszy, mniej szablonowy interfejs.

Pełne informacje: [`docs/RELEASE_NOTES_v1.8.6.md`](docs/RELEASE_NOTES_v1.8.6.md).

---

## ⚡ Funkcje

**Kanwa śledcza**
- ~90 typów jednostek w taksonomii (osoba, firma, nazwa użytkownika, e-mail, telefon, domena,
  IP, portfel krypto, pojazd, **wydarzenie**, lokalizacja…) z szablonami pól dla każdego typu.
- **Dedykowane moduły (1.8.1)** — przeszukiwalne katalogi banków, kryptowalut, marek,
  operatorów, krajów, sieci kart, algorytmów haszujących; zawsze dostępna dowolna wartość *„Inne”*.
- **Własne typy jednostek dla każdej tablicy** — zdefiniuj własne (nazwa, ikona, kolor,
  szablon pól); synchronizowane z każdym uczestnikiem i zapisywane w eksporcie `.trace`.
- **Datowanie wydarzeń** — dokładna data/godzina, przedział niepewności *najwcześniej → najpóźniej*
  lub dokładny czas trwania *od → do*.
- Notatki (markdown), notatki z datą, obrazy, bloki kodu z podświetleniem składni, karty
  linków, strefy grupujące.
- Źródła oceniane w **skali Admiralicji** (wiarygodność A–F / wiarygodność informacji 1–6),
  do dołączenia do dowolnego elementu, z raportem źródeł w Markdown.
- Odznaki statusu, tagi, dowolne kolory, wyszukiwanie pełnotekstowe niewrażliwe na akcenty,
  filtry, legenda, minimapa oraz **dwie przeglądalne osie czasu** — kiedy elementy zostały
  *dodane* i kiedy wydarzenia *miały miejsce*.
- Import CSV (inteligentne wykrywanie kolumn), eksport CSV (kolumnami), eksport PNG całej
  tablicy, przenośny `.trace` JSON.

**Połączenia w pełni pod kontrolą**
- Typy relacji, dowolne etykiety, strzałki kierunku, kolor/grubość/styl, krzywa/prosta/kątowa.
- Tryb **„Narysuj własną ścieżkę”**: wybierz dokładną stronę wyjścia na A, kliknij punkty
  pośrednie, wybierz stronę wejścia na B — podgląd na żywo, jedno cofnięcie, trasowanie
  automatyczne jako domyślne.

**Współpraca w czasie rzeczywistym (P2P)**
- Udostępnianie **12-znakowym kodem** (60 bitów entropii). Nowi uczestnicy czekają w
  **poczekalni** i są wpuszczani przez członka online (otwarty / za zgodą / prywatny).
- Role (administrator / edytor / gość), limit uczestników (2–10), cofanie i rotacja kodu.
- Obecność: kursory, zaznaczenia, awatary, dostępność.

---

## 🛡️ Model bezpieczeństwa

| Co | Którędy | Czy strona trzecia widzi treść? |
|---|---|---|
| Treść tablicy (jednostki, połączenia, obrazy…) | **Bezpośrednio uczestnik ↔ uczestnik** (WebRTC, AES-GCM E2E) | Nigdy — nie dotyka żadnego serwera |
| Nawiązanie połączenia (zaszyfrowany handshake) | Serwer sygnalizacyjny (domyślnie publiczny, można hostować własny) | Nie — nieprzejrzysty identyfikator pokoju + zaszyfrowane bloby |
| Wykrycie publicznego IP | STUN (domyślnie Google/Cloudflare/Twilio, do zastąpienia) | Żadnych danych |
| Przekazywanie danych (TURN) | **Nie istnieje** z założenia | — |
| Sprawdzanie aktualizacji | GitHub Releases (opcjonalne, wyłączone w trybie lokalnym) | — |

- Kod udostępniania → identyfikator pokoju i klucz szyfrowania są wyprowadzane **lokalnie**
  (HKDF-SHA-256, osobne konteksty); sam kod nigdy nie jest przesyłany.
- Tablice są szyfrowane **losowym sekretem sesji** *niewyprowadzalnym z kodu*, zapieczętowanym
  dla każdego zatwierdzonego członka (ECDH P-256 → AES-GCM).
- Pełne szczegóły (po francusku): [GUIDE.fr.md](./GUIDE.fr.md) · [DECISIONS.md](./DECISIONS.md).

### Tryb w pełni lokalny (sieci zamknięte)

**Ustawienia → Sieć i prywatność** kontaktuje **tylko** wprowadzone adresy wewnętrzne — Twój
serwer sygnalizacyjny, opcjonalne wewnętrzne STUN/TURN — z **wyłączonym sprawdzaniem
aktualizacji**. Puste lub nieprawidłowe → udostępnione tablice pozostają **offline**, *bez
cichego przełączenia* na serwery publiczne. Podsumowanie na żywo *„Z czym aplikacja się
połączy”*, obliczane tą samą funkcją, która otwiera prawdziwe połączenia, to potwierdza.

---

## 📥 Pobieranie i instalacja

Pobierz najnowszą wersję z **[Releases](../../releases)**:

| Plik | Zastosowanie |
|---|---|
| `COSINT-Setup-x.y.z.exe` | Instalator Windows (menu Start, deinstalator, auto-aktualizacja) |
| `COSINT-Portable-x.y.z.exe` | Windows portable — bez instalacji |
| `COSINT-x.y.z-x86_64.AppImage` | Linux portable |
| `COSINT-x.y.z-amd64.deb` | Pakiet Debian/Ubuntu |

### Uruchamianie pobranego pliku

**Windows**
- **Instalator** — uruchom `COSINT-Setup-x.y.z.exe`, **wybierz język** (francuski / angielski /
  polski), wybierz folder, a następnie uruchom COSINT z menu Start (lub skrótu na pulpicie).
  Kolejne aktualizacje instalują się same.
- **Portable** — po prostu kliknij dwukrotnie `COSINT-Portable-x.y.z.exe`; nic nie jest instalowane.
- Aplikacja nie jest jeszcze podpisana cyfrowo, więc SmartScreen może ostrzec *„System Windows
  ochronił Twój komputer”* → **Więcej informacji** → **Uruchom mimo to** (tylko przy pierwszym uruchomieniu).

**Linux**
- **AppImage** (przenośny, bez instalacji) — nadaj prawo wykonywania, a następnie uruchom:
  ```bash
  chmod +x COSINT-x.y.z-x86_64.AppImage
  ./COSINT-x.y.z-x86_64.AppImage
  ```
  Przy błędzie `libfuse.so.2` zainstaluj FUSE (`sudo apt install libfuse2`) lub uruchom z
  `--appimage-extract-and-run`.
- **Debian/Ubuntu** — zainstaluj przez apt (pociągnie zależności), a następnie uruchom z menu
  aplikacji lub poleceniem `cosint`:
  ```bash
  sudo apt install ./COSINT-x.y.z-amd64.deb
  cosint
  ```
  Aby usunąć później: `sudo apt remove cosint`.

Twoje dane (tablice, profil) znajdują się w `%APPDATA%/COSINT` na Windows i `~/.config/COSINT`
na Linux — przetrwają aktualizacje i ponowne instalacje.

## 🖧 Samodzielny hosting serwera sygnalizacyjnego

Jedynym serwerem, jakiego możesz kiedykolwiek potrzebować, jest przekaźnik WebSocket o ok. 140
liniach ([`server/`](./server/README.md)), który przedstawia sobie uczestników — nie może niczego
odczytać. Node 18+:

```bash
cd server
npm install
PORT=4444 npm start        # → ws://twoj-host:4444
```

## 🛠️ Kompilacja ze źródeł

Wymagania: Node.js ≥ 18, npm.

```bash
npm install
npm run dev          # tryb deweloperski (hot reload)
npm run typecheck    # kontrole TypeScript
npm test             # testy jednostkowe + integracyjne P2P (vitest)
npm run build:win    # instalator + portable Windows → release/
npm run build:linux  # AppImage + .deb → release/
```

## 🧱 Stos technologiczny

[Electron](https://www.electronjs.org/) · [React](https://react.dev/) ·
[React Flow](https://reactflow.dev/) · [Yjs](https://yjs.dev/) (CRDT) ·
[y-webrtc](https://github.com/yjs/y-webrtc) · y-indexeddb · Zustand · Vite · Vitest

## 🤝 Współpraca

Zgłoszenia i PR-y są mile widziane — interfejs jest dostępny w językach **francuskim, angielskim
i polskim** (`src/renderer/src/i18n/`); **korekta ciągów angielskich/polskich** oraz **nowe
słowniki językowe**, tłumaczenia dokumentacji i relacje z prawdziwych śledztw są mile widziane.
Decyzje architektoniczne są odnotowane w [DECISIONS.md](./DECISIONS.md).

## 📄 Licencja

[MIT](./LICENSE)
