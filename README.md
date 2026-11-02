# Jarvis — prywatny panel do social mediów

Jeden panel do planowania i publikowania postów na **Facebooku, Instagramie, YouTube i TikToku**.
Wgrywasz plik, piszesz opis, zaznaczasz konta i wybierasz godzinę. Panel sam publikuje o czasie
i pokazuje wynik dla każdej platformy.

Panel jest dla jednej osoby: logujesz się jednym hasłem, a całość działa na jednym małym serwerze.

## Co umie

- **Konta**: łączenie przez oficjalne logowanie platform (OAuth). Tokeny odświeżają się automatycznie.
- **Edytor posta**: jeden plik (zdjęcie lub film) i opis na wiele kont naraz. Każde konto może mieć
  własny opis. Dla YouTube ustawiasz tytuł i widoczność, dla TikToka sposób publikacji.
- **Planowanie**: „Opublikuj teraz” albo wybrana data i godzina. Harmonogram sprawdza kolejkę co 20 s.
- **Kalendarz**: widok miesiąca z postami i statusami. Kliknięcie „+” w dniu zaczyna post na ten dzień.
- **Historia**: status każdej publikacji, link do opublikowanego posta, czytelny komunikat błędu,
  przycisk „Ponów nieudane”, zmiana terminu i usuwanie posta.

## Co działa od razu, a co po weryfikacji platform

Panel jest przeznaczony do Twoich własnych kont, więc większość zgód platform nie jest potrzebna. Są dwa wyjątki:

| Platforma | Od razu | Po audycie (darmowy wniosek) |
|---|---|---|
| Facebook (strona) | ✅ pełna publikacja | — |
| Instagram (konto Business/Twórca) | ✅ pełna publikacja | — |
| YouTube | ⚠️ film trafia na kanał jako **prywatny** (zmieniasz go w YouTube Studio) | ✅ publiczny od razu |
| TikTok | ⚠️ film trafia do **skrzynki w aplikacji TikTok**, gdzie dodajesz opis i publikujesz jednym kliknięciem. Albo publikacja bezpośrednia jako „Tylko ja”. | ✅ publikacja bezpośrednia, publiczna |

Ograniczenia formatów, które wynikają z API platform:
- Instagram przyjmuje zdjęcia tylko w **JPG**. Filmy publikują się jako Reels.
- YouTube i TikTok przyjmują tylko **filmy**. Pionowy film do 3 minut YouTube sam oznacza jako Short.
- Pliki: JPG, PNG, MP4, MOV, maksymalnie 4 GB.

---

## Instalacja na serwerze

Potrzebujesz:
- **serwera VPS** z Ubuntu lub Debianem (wystarczy 1 vCPU i 1–2 GB RAM, np. Hetzner, Mikrus, OVH),
- **domeny lub subdomeny** (np. `panel.twojadomena.pl`) z rekordem **A** w DNS wskazującym na IP serwera.

HTTPS jest wymagany: Instagram i Facebook pobierają pliki z Twojego serwera, a TikTok przyjmuje
tylko adresy `https://`. Certyfikat wystawia się automatycznie.

### Instalacja jednym poleceniem

Zaloguj się na serwer przez SSH jako root i wklej:

```bash
curl -fsSL https://raw.githubusercontent.com/kototalny/jarvis/main/install.sh | bash
```

Skrypt zainstaluje Dockera, pobierze panel, zapyta o domenę i hasło, a potem wszystko uruchomi.
Na końcu wyświetli adres panelu. Potem:

1. Otwórz panel w przeglądarce i zaloguj się.
2. Wejdź w **Ustawienia** i wpisz klucze API platform (instrukcja niżej).
3. Wejdź w **Konta** i kliknij **Połącz** przy każdej platformie.

**Aktualizacja** do nowej wersji: uruchom to samo polecenie jeszcze raz. Dane, konta i ustawienia
zostają.

Panel jest zainstalowany w `/opt/jarvis`. Przydatne polecenia:

```bash
cd /opt/jarvis && docker compose logs -f app
```

```bash
cd /opt/jarvis && docker compose restart
```

Hasło do panelu zmienisz w pliku `/opt/jarvis/.env` (`ADMIN_PASSWORD`). Potem uruchom:

```bash
cd /opt/jarvis && docker compose up -d
```

Baza danych i wgrane pliki leżą w wolumenie Dockera `jarvis_data`.

---

## Podłączanie platform

Klucze z konsol deweloperskich wpisujesz w panelu na stronie **Ustawienia**. Ta strona pokazuje też
dokładny **Redirect URI** dla każdej platformy, który wklejasz w konsoli deweloperskiej. Ma postać
`https://twoja-domena/api/callback/<meta|youtube|tiktok>`.

Wszystkie platformy wymagają też linku do **polityki prywatności** (i czasem regulaminu). Możesz
wykorzystać stronę ze swojego sklepu albo dowolną prostą stronę z polityką.

### Facebook + Instagram (Meta)

Najpierw przygotuj konta:
1. Musisz mieć **stronę na Facebooku** (nie profil prywatny).
2. Instagram przełącz na **konto profesjonalne** (Business albo Twórca): w aplikacji Instagram wejdź w
   Ustawienia → Typ konta i narzędzia.
3. Połącz Instagram ze stroną na Facebooku: Ustawienia strony → Połączone konta → Instagram.

Potem załóż aplikację:
1. Wejdź na <https://developers.facebook.com> → **Moje aplikacje** → **Utwórz aplikację**.
2. Typ lub przypadek użycia: **Business** („Inne” → „Business”, jeśli kreator o to pyta).
3. Dodaj produkty **Facebook Login** (albo „Facebook Login for Business”) oraz **Instagram Graph API**.
4. W ustawieniach logowania, w polu **Valid OAuth Redirect URIs**, wpisz Redirect URI z panelu.
5. **Ustawienia → Podstawowe**: skopiuj **App ID** i **App Secret** do panelu (**Ustawienia**). W konsoli
   Meta dodaj też link do polityki prywatności.
6. Jeśli aplikacja ma „Facebook Login for Business”, utwórz w nim **Konfigurację** z uprawnieniami:
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`,
   `instagram_basic`, `instagram_content_publish`. Jej ID wpisz w panelu w pole **Configuration ID**.
   Przy zwykłym „Facebook Login” zostaw to pole puste.
7. Aplikacja może zostać w **trybie deweloperskim**. Jako jej administrator masz wszystkie uprawnienia
   bez App Review.
8. W panelu kliknij **Konta → Facebook + Instagram → Połącz** i zaznacz swoje strony.

Tokeny stron pobrane w ten sposób nie wygasają. Jeśli zmienisz hasło do Facebooka, połącz konto ponownie.

### YouTube (Google)

1. Wejdź na <https://console.cloud.google.com> i utwórz nowy projekt.
2. **APIs & Services → Library**: włącz **YouTube Data API v3**.
3. **OAuth consent screen** (Google Auth Platform): typ **External**, uzupełnij nazwę, e-mail i link do
   polityki prywatności. Dodaj swój adres Gmail jako **test user**.
4. **Credentials → Create credentials → OAuth client ID** → typ **Web application**. W polu
   **Authorized redirect URIs** wpisz Redirect URI z panelu.
5. Client ID i Client secret wpisz w panelu (**Ustawienia**).
6. **Ważne:** na ekranie zgody kliknij **Publish app** (status „In production”). W trybie „Testing” Google
   unieważnia dostęp co 7 dni. Weryfikacja aplikacji nie jest potrzebna do prywatnego użytku. Przy
   logowaniu zobaczysz ostrzeżenie „Google nie zweryfikował tej aplikacji”: kliknij *Zaawansowane →
   Przejdź do…*.
7. W panelu kliknij **Konta → YouTube → Połącz**.

Żeby filmy mogły od razu być publiczne, złóż darmowy wniosek o audyt: **YouTube API Services – Audit
and Quota Extension Form**. Do tego czasu panel pokaże informację, że film jest prywatny.

### TikTok

1. Wejdź na <https://developers.tiktok.com>, zarejestruj się i wybierz **Manage apps → Connect an app**.
2. Uzupełnij dane aplikacji: ikonę, opis, kategorię oraz linki do polityki prywatności i regulaminu.
3. Dodaj produkty **Login Kit** i **Content Posting API**. W Content Posting API włącz **Direct Post**.
4. Zakres uprawnień (scopes): `user.info.basic`, `video.upload`, `video.publish`.
5. W Login Kit wpisz Redirect URI z panelu (musi być `https://`).
6. Zanim aplikacja przejdzie przegląd, użyj trybu **Sandbox**: utwórz sandbox i dodaj w nim swoje konto
   TikTok jako **Target user**. Klucze sandboxa (Client key i Client secret) wpisz w panelu
   (**Ustawienia**).
7. W panelu kliknij **Konta → TikTok → Połącz**.

Sposoby publikacji na TikToku (wybierasz przy każdym poście):
- **Do skrzynki** (domyślnie): film pojawia się w powiadomieniach aplikacji TikTok. Dodajesz opis i
  dźwięk, a potem publikujesz. Działa bez audytu.
- **Bezpośrednio**: film publikuje się sam. Bez audytu TikTok pozwala tylko na widoczność „Tylko ja”.
  Po audycie (wniosek w konsoli TikTok) możesz publikować publicznie.

---

## Uruchomienie lokalne (do rozwoju)

Wymagany Node.js 22.13 lub nowszy.

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

Lokalnie zadziała logowanie do panelu, kalendarz, edytor i łączenie YouTube (Google akceptuje
`http://localhost`). Publikacja na Instagram i Facebook wymaga publicznego adresu HTTPS, a TikTok
nie przyjmuje localhosta, więc te platformy najlepiej testować od razu na serwerze.

## Jak to działa

- **Next.js 15** (App Router, TypeScript). Interfejs i API to jedna aplikacja.
- **SQLite** (wbudowany w Node.js, `node:sqlite`): plik `data/jarvis.db`. Pliki postów leżą w `data/uploads/`.
- **Harmonogram** startuje razem z serwerem (`src/instrumentation.ts`) i co 20 s publikuje posty, których
  termin minął. Jeśli serwer zrestartuje się w trakcie publikacji, panel oznacza ją jako nieudaną,
  zamiast ponawiać ją automatycznie. Dzięki temu nic nie opublikuje się dwa razy. Ponawiasz ją jednym
  kliknięciem.
- **Pliki** są dostępne publicznie pod `/media/<losowy-uuid>.<ext>`, bo Instagram i Facebook muszą je
  pobrać. Nazw nie da się odgadnąć. Reszta panelu wymaga zalogowania.

```
src/
  app/(panel)/        strony: kalendarz, nowy post, posty, konta
  app/api/            upload plików, logowanie OAuth, wylogowanie
  app/media/          serwowanie plików dla platform
  app/actions.ts      akcje serwera (tworzenie postów, ponawianie, ustawienia…)
  lib/platforms/      integracje: meta.ts, youtube.ts, tiktok.ts
  lib/scheduler.ts    harmonogram publikacji
  lib/db.ts           baza danych
```

## Kopia zapasowa

Wszystko, co trzeba zabezpieczyć, jest w wolumenie `jarvis_data`:

```bash
docker run --rm -v jarvis_jarvis_data:/data -v "$PWD":/backup alpine tar czf /backup/jarvis-backup.tgz -C /data .
```
