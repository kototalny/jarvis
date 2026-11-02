#!/usr/bin/env bash
# Instalator panelu Jarvis na czystym serwerze (Ubuntu/Debian).
# Uruchom jako root:
#   curl -fsSL https://raw.githubusercontent.com/kototalny/jarvis/main/install.sh | bash
# Ponowne uruchomienie aktualizuje panel do najnowszej wersji (dane i ustawienia zostają).
set -euo pipefail

REPO_URL="https://github.com/kototalny/jarvis.git"
DIR="${JARVIS_DIR:-/opt/jarvis}"

say() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mBłąd:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Uruchom jako root (np. sudo bash install.sh)."
[ -r /dev/tty ] || die "Brak terminala do zadawania pytań. Uruchom skrypt w sesji SSH."

ask() { local reply; read -r -p "$1" reply </dev/tty; printf '%s' "$reply"; }
ask_secret() { local reply; read -r -s -p "$1" reply </dev/tty; echo >/dev/tty; printf '%s' "$reply"; }
random_hex() { od -An -N"$(( $1 / 2 ))" -tx1 /dev/urandom | tr -d ' \n'; }

# --- Pakiety -----------------------------------------------------------------
if ! command -v git >/dev/null || ! command -v curl >/dev/null; then
  say "Instaluję git i curl"
  apt-get update -qq && apt-get install -y -qq git curl ca-certificates >/dev/null
fi
if ! command -v docker >/dev/null; then
  say "Instaluję Dockera (to potrwa około minuty)"
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
docker compose version >/dev/null 2>&1 || die "Brak 'docker compose'. Zainstaluj plugin docker-compose-plugin."

# --- Kod ---------------------------------------------------------------------
if [ -d "$DIR/.git" ]; then
  say "Aktualizuję kod w $DIR"
  git -C "$DIR" pull --ff-only origin main
else
  say "Pobieram panel do $DIR"
  git clone --depth 1 --branch main "$REPO_URL" "$DIR"
fi
cd "$DIR"

# --- Konfiguracja ------------------------------------------------------------
if [ -f .env ]; then
  say "Znaleziono istniejący plik .env — zostawiam bez zmian"
  DOMAIN="$(grep -E '^DOMAIN=' .env | cut -d= -f2-)"
  PASSWORD_INFO="(bez zmian)"
else
  say "Konfiguracja"
  echo "Domena musi już wskazywać na ten serwer (rekord A w DNS)."
  while :; do
    DOMAIN="$(ask 'Domena panelu (np. panel.twojadomena.pl): ')"
    DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
    [[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] && break
    warn "To nie wygląda na domenę. Spróbuj jeszcze raz."
  done

  BAD_CHARS='[[:space:]$#"'"'"'\\`]'
  echo "Hasło do panelu: min. 8 znaków, bez spacji i znaków: \$ # \" ' \\ \`"
  echo "Zostaw puste, a wygeneruję losowe."
  while :; do
    PASSWORD="$(ask_secret 'Hasło: ')"
    if [ -z "$PASSWORD" ]; then PASSWORD="$(random_hex 16)"; PASSWORD_INFO="$PASSWORD (wygenerowane — zapisz je!)"; break; fi
    if [ "${#PASSWORD}" -lt 8 ] || [[ "$PASSWORD" =~ $BAD_CHARS ]]; then
      warn "Hasło jest za krótkie albo zawiera niedozwolony znak."; continue
    fi
    [ "$PASSWORD" = "$(ask_secret 'Powtórz hasło: ')" ] || { warn "Hasła się różnią."; continue; }
    PASSWORD_INFO="(to, które podałeś)"
    break
  done

  umask 077
  cat > .env <<EOF
APP_URL=https://$DOMAIN
DOMAIN=$DOMAIN
ADMIN_PASSWORD=$PASSWORD
SESSION_SECRET=$(random_hex 64)
APP_TIMEZONE=Europe/Warsaw
# Klucze API platform wpisujesz w panelu: Ustawienia.
EOF
  umask 022
fi

# --- Sprawdzenie DNS ----------------------------------------------------------
SERVER_IP="$(curl -fsS -4 --max-time 5 https://api.ipify.org 2>/dev/null || true)"
DOMAIN_IP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)"
if [ -z "$DOMAIN_IP" ]; then
  warn "Domena $DOMAIN jeszcze nie wskazuje na żaden serwer. Ustaw rekord A na ${SERVER_IP:-IP tego serwera}."
  warn "Certyfikat HTTPS zostanie wystawiony automatycznie, gdy DNS zacznie działać."
elif [ -n "$SERVER_IP" ] && [ "$DOMAIN_IP" != "$SERVER_IP" ]; then
  warn "Domena $DOMAIN wskazuje na $DOMAIN_IP, a ten serwer ma IP $SERVER_IP. Popraw rekord A w DNS."
fi

# --- Zapora --------------------------------------------------------------------
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  say "Otwieram porty 80 i 443 w zaporze"
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
fi

# --- Start ---------------------------------------------------------------------
say "Buduję i uruchamiam panel (pierwszy raz może to potrwać kilka minut)"
docker compose up -d --build

say "Gotowe!"
cat <<EOF

  Adres panelu:  https://$DOMAIN
  Hasło:         $PASSWORD_INFO

  Następne kroki:
    1. Otwórz panel i zaloguj się.
    2. Ustawienia → wpisz klucze API (instrukcja: https://github.com/kototalny/jarvis#podłączanie-platform)
    3. Konta → Połącz.

  Aktualizacja w przyszłości: uruchom ten sam skrypt jeszcze raz.
  Logi: cd $DIR && docker compose logs -f app
EOF
