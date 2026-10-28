#!/usr/bin/env bash
# F Cartel — install / re-apply on a VPS that already hosts other sites.
#
#   cd deploy && sudo ./setup.sh            # interactive
#   sudo ./setup.sh --yes                   # don't ask before adding the nginx site
#   sudo ./setup.sh --skip-nginx            # only (re)start the containers
#
# Safe to run again at any time. It never stops, edits or reloads anything
# belonging to another site: it starts the isolated "fcartel" Docker project,
# adds ONE nginx server block for $FCARTEL_DOMAIN (only if it isn't there yet,
# validated with `nginx -t` and removed again if that fails), and asks certbot
# for a certificate for that one name. See README.md.
set -euo pipefail
cd "$(dirname "$0")"

ASSUME_YES=0
SKIP_NGINX=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) ASSUME_YES=1 ;;
    --skip-nginx) SKIP_NGINX=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

COMPOSE=(docker compose -f docker-compose.prod.yml)
bold() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!  %s\033[0m\n' "$*"; }
die() { printf '\033[31mx  %s\033[0m\n' "$*" >&2; exit 1; }
confirm() {
  [ "$ASSUME_YES" = 1 ] && return 0
  read -r -p "$1 [y/N] " reply
  [[ "$reply" =~ ^[Yy] ]]
}
env_get() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- ; }
env_set() {
  if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}

# ── 1. Preflight ─────────────────────────────────────────────────────────────
bold "Checking this server"
[ "$(id -u)" = 0 ] || die "Run with sudo (it needs Docker and, for the nginx step, /etc/nginx)."
command -v docker >/dev/null || die "Docker is not installed. See README.md → 'Docker' (it does not affect running sites)."
docker info >/dev/null 2>&1 || die "Docker is installed but not running: systemctl start docker"
docker compose version >/dev/null 2>&1 || die "The Docker Compose plugin is missing: apt-get install docker-compose-plugin"
command -v openssl >/dev/null || die "openssl is required: apt-get install openssl"
echo "Docker $(docker version --format '{{.Server.Version}}'), $(docker compose version --short)"

# ── 2. Settings (.env) ───────────────────────────────────────────────────────
bold "Settings"
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  env_set POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  env_set JWT_SECRET "$(openssl rand -hex 32)"
  env_set UPDATER_TOKEN "$(openssl rand -hex 32)"
  env_set RELEASE_WEBHOOK_SECRET "$(openssl rand -hex 32)"
  echo "Created deploy/.env with generated secrets."
  echo "Now open it (nano .env), fill in FCARTEL_VERSION, REGISTRY_TOKEN,"
  echo "SUPER_ADMIN_EMAILS and LETSENCRYPT_EMAIL, then run this script again."
  exit 0
fi
chmod 600 .env
missing=()
for key in FCARTEL_DOMAIN FCARTEL_PORT FCARTEL_VERSION FCARTEL_IMAGE_PREFIX REGISTRY_USERNAME REGISTRY_TOKEN SUPER_ADMIN_EMAILS POSTGRES_PASSWORD JWT_SECRET UPDATER_TOKEN; do
  [ -n "$(env_get "$key")" ] || missing+=("$key")
done
[ ${#missing[@]} -eq 0 ] || die "Fill in these values in deploy/.env first: ${missing[*]}"
DOMAIN=$(env_get FCARTEL_DOMAIN)
PORT=$(env_get FCARTEL_PORT)
VERSION=$(env_get FCARTEL_VERSION)
[[ "$VERSION" =~ ^(sha-[0-9a-f]{7,40}|[0-9]+\.[0-9]+\.[0-9]+)$ ]] || die "FCARTEL_VERSION must be an image tag like sha-1a2b3c4 (see README.md)."
echo "Domain $DOMAIN, version $VERSION, local port 127.0.0.1:$PORT"

# The port must be free — unless it's our own web container from a previous run.
if ss -ltnH "( sport = :$PORT )" | grep -q .; then
  owner=$(docker ps --filter "publish=$PORT" --format '{{.Names}}' | head -n1)
  [ "$owner" = "fcartel-web" ] || die "Port $PORT is already used on this server. Pick a free one for FCARTEL_PORT in .env."
fi

# ── 3. Images ────────────────────────────────────────────────────────────────
bold "Signing in to $(env_get REGISTRY_SERVER) to pull the private images"
env_get REGISTRY_TOKEN | docker login "$(env_get REGISTRY_SERVER)" -u "$(env_get REGISTRY_USERNAME)" --password-stdin >/dev/null
echo "Signed in."

bold "Starting F Cartel (Docker project \"fcartel\")"
"${COMPOSE[@]}" up -d --build
echo "Waiting for the app to answer on 127.0.0.1:$PORT (the first start runs the database setup)..."
for _ in $(seq 1 60); do
  if curl -fs -o /dev/null "http://127.0.0.1:$PORT/" && curl -fs -o /dev/null "http://127.0.0.1:$PORT/api/health"; then
    ok=1; break
  fi
  sleep 3
done
[ "${ok:-0}" = 1 ] || die "The app did not come up. Check: docker logs fcartel-backend   (other sites are unaffected)"
echo "F Cartel is running."

if [ "$SKIP_NGINX" = 1 ]; then
  bold "Skipping nginx (--skip-nginx). Done."
  exit 0
fi

# ── 4. nginx site for $DOMAIN ────────────────────────────────────────────────
bold "Web server for $DOMAIN"
listeners=$(ss -ltnpH "( sport = :80 or sport = :443 )" || true)
if ! grep -q '"nginx"' <<<"$listeners"; then
  warn "Ports 80/443 are not served by nginx on this host:"
  echo "${listeners:-  (nothing is listening)}"
  warn "Nothing was changed. Point $DOMAIN at http://127.0.0.1:$PORT in your web server by hand — README.md → 'Not using nginx'."
  exit 0
fi
command -v nginx >/dev/null || die "nginx is serving port 80 but its command isn't on PATH."

if [ -d /etc/nginx/sites-available ] && [ -d /etc/nginx/sites-enabled ]; then
  SITE=/etc/nginx/sites-available/fcartel.conf
  LINK=/etc/nginx/sites-enabled/fcartel.conf
else
  SITE=/etc/nginx/conf.d/fcartel.conf
  LINK=""
fi

if [ -f "$SITE" ]; then
  echo "$SITE already exists — leaving it exactly as it is (it may hold certbot's HTTPS lines)."
else
  ipv6=""
  grep -q '\[::\]:80' <<<"$listeners" && ipv6="    listen [::]:80;"
  rendered=$(sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__PORT__/$PORT/g" -e "s|__IPV6_LISTEN__|$ipv6|" nginx/fcartel.conf.template)
  echo "This adds ONE new file, $SITE, answering only for $DOMAIN:"
  echo "----------------------------------------------------------------"
  echo "$rendered"
  echo "----------------------------------------------------------------"
  confirm "Add it and reload nginx (a graceful reload; other sites keep serving)?" || die "Stopped before touching nginx. F Cartel is running on 127.0.0.1:$PORT."
  printf '%s\n' "$rendered" > "$SITE"
  [ -n "$LINK" ] && ln -sf "$SITE" "$LINK"
  if ! nginx -t; then
    rm -f "$SITE" ${LINK:+"$LINK"}
    die "nginx rejected the new site, so it was removed again — nginx was NOT reloaded and nothing else changed."
  fi
  systemctl reload nginx 2>/dev/null || nginx -s reload
  echo "nginx reloaded with the new site."
fi

# ── 5. HTTPS certificate for $DOMAIN only ────────────────────────────────────
bold "HTTPS for $DOMAIN"
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo "A certificate for $DOMAIN already exists — nothing to do."
elif ! getent hosts "$DOMAIN" >/dev/null; then
  warn "$DOMAIN doesn't resolve yet. Add the DNS record (README.md → 'DNS'), wait a few minutes, then run this again."
  exit 0
elif ! command -v certbot >/dev/null; then
  warn "certbot isn't installed. Install it with: apt-get install certbot python3-certbot-nginx — then run this again."
  exit 0
else
  email=$(env_get LETSENCRYPT_EMAIL)
  [ -n "$email" ] || die "Set LETSENCRYPT_EMAIL in .env (certificate expiry notices go there)."
  # --nginx edits only the server block whose server_name is $DOMAIN.
  certbot --nginx -d "$DOMAIN" --redirect --non-interactive --agree-tos -m "$email"
fi

bold "Done"
cat <<MSG
F Cartel is live at https://$DOMAIN

Next steps (README.md has the details):
  1. Sign up at https://$DOMAIN/signup with $(env_get SUPER_ADMIN_EMAILS | cut -d, -f1) — that account gets /admin.
  2. GitHub → Settings → Secrets and variables → Actions → add:
       RELEASE_WEBHOOK_URL     https://$DOMAIN/api/v1/releases/announce
       RELEASE_WEBHOOK_SECRET  (RELEASE_WEBHOOK_SECRET from deploy/.env)
  3. Razorpay webhook URL: https://$DOMAIN/api/v1/billing/razorpay/webhook
MSG
