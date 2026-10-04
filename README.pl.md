<p align="center">
  <img src="docs/assets/bannerpng.png" alt="COSINT — wspólna tablica śledcza OSINT" width="100%">
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.fr.md">Français</a> · <b>Polski</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/wersja-1.9.0-06b6d4" alt="Wersja">
  <img src="https://img.shields.io/badge/licencja-MIT-3fbf6a" alt="Licencja">
  <img src="https://img.shields.io/badge/platforma-Windows%20·%20Linux-8b5cf6" alt="Platforma">
  <img src="https://img.shields.io/badge/testy-578%20zielone-3fbf6a" alt="Testy">
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

## 🚀 Nowości w 1.9.0

- **🖼️ Kopiowanie obrazu, które naprawdę działa w Windows** — Ctrl+C na obrazie umieszcza
  w schowku **sam obraz**, gotowy do wklejenia w dowolnej innej aplikacji. Wcześniej system
  nie potrafił odczytać zapisanego WebP, a schowek był czyszczony, a potem blokowany przez
  programy, które go nasłuchują (historia schowka Windows): teraz COSINT zapisuje go raz
  i sprawdza wynik. Do tego **prawy przycisk › Kopiuj obraz / Zapisz obraz jako**,
  **przeciąganie obrazu poza tablicę** na pulpit lub do innej aplikacji, a ponowne wklejenie
  w COSINT zachowuje tytuł, tagi i rozmiar.
- **🧷 Obrazy w jednostkach** — **galeria do 12 obrazów** na jednostkę, pierwszy jako
  **okładka** na węźle (z odznaką **+N**). Dodawanie z panelu Szczegóły, menu kontekstowego,
  paska narzędzi węzła lub przez **upuszczenie plików obrazów na jednostkę**; podgląd
  pełnoekranowy, wybór okładki, zmiana kolejności, kopiowanie, zapis.
- **📄 Podgląd dokumentów** — PDF pokazuje **pierwszą stronę i liczbę stron** i otwiera się
  w **przeglądarce** (strony, powiększenie); **Word / Excel / PowerPoint** (docx, xlsx, pptx
  — starsze doc, xls, ppt w miarę możliwości), **LibreOffice / OpenOffice** (odt, ods, odp,
  odg) i **RTF** pokazują swoją treść, pliki **Apple iWork** swoją miniaturę; **audio** (mp3,
  wav, ogg, flac, m4a…) ma odtwarzacz z tagami, **wideo** (mp4, webm…) odtwarza się
  w przeglądarce; **kod i skrypty** (.bat, .ps1, .sh, .py…) są podświetlane i **nigdy nie są
  uruchamiane**; plik tekstowy pokazuje fragment; pozostałe pliki czytelną kartę. Renderowane
  lokalnie, nic dodatkowego nie jest synchronizowane.
- **🔗 Pełne ustawienia wstępne połączeń** — preset zapisuje **każde ustawienie połączenia**
  (relacja, w tym dowolna *„Inne”*, etykieta, kolor, grubość, kreski, strzałki, ścieżka,
  status, strony zakotwiczenia). Zarządzanie w Ustawieniach z podglądem na żywo, stosowanie
  lub zapis z paska narzędzi połączenia, stosowanie do wielu połączeń naraz i wybór zaraz po
  połączeniu dwóch jednostek.
- **📎 Poza tym** — import **dowolnego pliku** (przycisk Zapisz, 25 MB na plik), **pasek
  narzędzi w wybranym miejscu** (lewo/prawo/góra/dół), **ikona dla każdej jednostki**,
  **wielowierszowe pola jednostek**.

Pełne informacje: [`docs/RELEASE_NOTES_v1.9.0.md`](docs/RELEASE_NOTES_v1.9.0.md).

<details>
<summary>1.8.9 — automatyczne odnajdywanie serwera w DHCP, samouczek wyjaśniający model</summary>

- **📡 Twój serwer w DHCP, odnajdywany automatycznie** — własny serwer sygnalizacyjny, którego
  adres zmieniał się w nocy, oznaczał odtwarzanie profilu i import na każdym stanowisku,
  każdego ranka. Teraz każde stanowisko sprawdza zapisany adres przy uruchomieniu i, gdy ten
  przestaje odpowiadać, **samo odnajduje serwer w sieci lokalnej**. Rozpoznaje go po
  **odcisku wyprowadzonym z Twojego tokenu dostępu**: nie da się trafić na inny serwer niż
  Twój, a **token nigdy nie jest wysyłany, zanim ten serwer nie zostanie zidentyfikowany**.
  Sondowany jest tylko skonfigurowany port i wyłącznie Twoje podsieci prywatne. Wymaga
  serwera w wersji 1.8.9.
- **🎓 Samouczek tłumaczy też zasadę działania** — cztery dodatkowe kroki poza samą mechaniką:
  określanie, co wiemy (do sprawdzenia / potwierdzone / odrzucone), kto co może (role i limit
  uczestników), gdzie naprawdę trafiają Twoje dane (peer-to-peer, szyfrowanie end-to-end, co
  serwer widzi, a czego nie) oraz praca offline z plikiem `.trace` jako kopią zapasową.

Pełne informacje: [`docs/RELEASE_NOTES_v1.8.9.md`](docs/RELEASE_NOTES_v1.8.9.md).

</details>

<details>
<summary>1.8.8 — samouczek prowadzony, ustawienia w zakładkach, nowa ikona</summary>

- **🎓 Samouczek prowadzony, prosto z ekranu głównego** — dyskretny przycisk *Samouczek*
  wprowadza w podstawy, **wskazując prawdziwy interfejs** podczas pracy.
- **🗂️ Ustawienia wreszcie uporządkowane** — **pięć zakładek** (Profil, Wygląd, Skróty, Sieć,
  O programie).
- **🖼️ Nowa ikona aplikacji** — odświeżone logo: instalator, pasek zadań, okno i ekran główny.
- **🔄 Aktualizacje pozostają włączone w trybie w pełni lokalnym**, z jednym polem wyboru do
  ich wyłączenia w sieci naprawdę odizolowanej.
- **📘 Prawdziwy przewodnik wdrożeniowy, we wszystkich trzech językach** —
  [`docs/DEPLOY_LOCAL.pl.md`](docs/DEPLOY_LOCAL.pl.md).
- **✍️ Autor: k0nrd** — ekran główny mówi teraz, kto to napisał, o jedno kliknięcie od źródeł.

Pełne informacje: [`docs/RELEASE_NOTES_v1.8.8.md`](docs/RELEASE_NOTES_v1.8.8.md).

</details>

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
- **Obrazy w jednostkach (1.9)** — galeria dla każdej jednostki z okładką na węźle,
  podgląd pełnoekranowy, kopiowanie / zapis / przeciąganie obrazu do innej aplikacji.
- **Pliki z podglądem (1.9)** — import dowolnego pliku; PDF pokazuje pierwszą stronę
  i otwiera się w przeglądarce ze stronami i powiększeniem; dokumenty biurowe (Word, Excel,
  PowerPoint, LibreOffice, RTF), audio z odtwarzaczem, wideo, podświetlony kod (nigdy nie
  uruchamiany) i fragmenty tekstu — renderowane lokalnie, z ograniczonymi parserami.
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
- **Ustawienia wstępne połączeń (1.9)** — zapisz dowolny zestaw ustawień pod nazwą, zastosuj
  go do jednego lub wielu połączeń albo wybierz zaraz po połączeniu dwóch jednostek.

**Współpraca w czasie rzeczywistym (P2P)**
- Udostępnianie **12-znakowym kodem** (60 bitów entropii). Nowi uczestnicy czekają w
  **poczekalni** i są wpuszczani przez członka online (otwarty / za zgodą / prywatny).
- Role (administrator / edytor / gość), limit uczestników (2–10), cofanie i rotacja kodu.
- Obecność: kursory, zaznaczenia, awatary, dostępność.

---

## 🛡️ Model bezpieczeństwa

| Co | Którędy | Czy strona trzecia widzi treść? |
|---|---|---|
| Treść tablicy (jednostki, połączenia, obrazy, pliki…) | **Bezpośrednio uczestnik ↔ uczestnik** (WebRTC, AES-GCM E2E) | Nigdy — nie dotyka żadnego serwera |
| Nawiązanie połączenia (zaszyfrowany handshake) | Serwer sygnalizacyjny (domyślnie publiczny, można hostować własny) | Nie — nieprzejrzysty identyfikator pokoju + zaszyfrowane bloby |
| Wykrycie publicznego IP | STUN (domyślnie Google/Cloudflare/Twilio, do zastąpienia) | Żadnych danych |
| Przekazywanie danych (TURN) | **Nie istnieje** z założenia | — |
| Sprawdzanie aktualizacji | GitHub Releases (opcjonalne, jedno pole — jedyna usługa publiczna osiągalna w trybie lokalnym) | — |

- Kod udostępniania → identyfikator pokoju i klucz szyfrowania są wyprowadzane **lokalnie**
  (HKDF-SHA-256, osobne konteksty); sam kod nigdy nie jest przesyłany.
- Tablice są szyfrowane **losowym sekretem sesji** *niewyprowadzalnym z kodu*, zapieczętowanym
  dla każdego zatwierdzonego członka (ECDH P-256 → AES-GCM).
- Pełne szczegóły (po francusku): [GUIDE.fr.md](./GUIDE.fr.md) · [DECISIONS.md](./DECISIONS.md).

### Tryb w pełni lokalny (sieci zamknięte)

**Ustawienia → Sieć** kontaktuje **tylko** wprowadzone adresy wewnętrzne — Twój serwer
sygnalizacyjny, opcjonalne wewnętrzne STUN/TURN. Puste lub nieprawidłowe → udostępnione
tablice pozostają **offline**, *bez cichego przełączenia* na serwery publiczne. Podsumowanie
na żywo *„Z czym aplikacja się połączy”*, obliczane tą samą funkcją, która otwiera prawdziwe
połączenia, to potwierdza.

Od **1.8.8** sprawdzanie aktualizacji pozostaje **włączone** w trybie lokalnym, aby
stanowisko nie utknęło po cichu na starej wersji — GitHub Releases jest wtedy *jedyną*
kontaktowaną usługą publiczną, żadne dane tablic przez nią nie przechodzą, a **odznaczenie
jednego pola** przywraca całkowicie zamkniętą konfigurację.

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

**Wdrożenie w sieci zamkniętej?** Skorzystaj z pełnego przewodnika krok po kroku:
[`docs/DEPLOY_LOCAL.pl.md`](docs/DEPLOY_LOCAL.pl.md) — usługa systemd, token dostępu, reguły
zapory **wraz z IPv6**, marka organizacji, weryfikacja end-to-end, konfiguracja stanowisk
jednym kliknięciem (`.cosint-org`), rozwiązywanie problemów i codzienna eksploatacja.
Sprawdzone na Ubuntu 24.04. Dostępne także po
[angielsku](docs/DEPLOY_LOCAL.md) i [francusku](docs/DEPLOY_LOCAL.fr.md).

## 🛠️ Kompilacja ze źródeł

Wymagania: Node.js ≥ 22.12, npm.

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
