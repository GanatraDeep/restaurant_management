# Deploying F Cartel to the Hostinger VPS (fcartel.divtech.cloud)

This puts F Cartel on its own sub-domain of a VPS that already hosts other
sites, and sets up **approve-before-production updates**: every push to
`master` builds a new version, and nothing reaches the live site until a super
admin presses **Deploy** in **Admin console → Releases**.

```
Internet ──► nginx (already on the VPS, ports 80/443)
               ├── divtech.cloud, other sites ──► unchanged
               └── fcartel.divtech.cloud ──► 127.0.0.1:3095 ──► fcartel-web
                                                                  │
                                       fcartel-backend ◄──────────┘
                                         │        ▲
                               fcartel-postgres   │ swaps versions you approve
                                                  fcartel-updater
```

## Why this can't disturb your other sites

- **Isolated Docker project** (`fcartel`): its own network, volumes and
  database; every container is named `fcartel-*`. Nothing else on the server
  is started, stopped or changed.
- **No public ports.** The web container listens on `127.0.0.1:3095` only;
  the database, API and updater have no published port at all.
- **One new nginx file**, answering only for `fcartel.divtech.cloud`. The
  setup script shows it to you first, validates it with `nginx -t`, and if
  validation fails it deletes the file again without reloading nginx. The
  reload is graceful: running sites keep serving.
- **The certificate is for `fcartel.divtech.cloud` only**; certbot edits only
  that server block.
- **Nothing is compiled on the VPS.** GitHub Actions builds the images, so
  your server's CPU and memory stay with your sites.
- **Memory caps and log rotation** on every container (`*_MEM_LIMIT` in
  `.env`), so F Cartel can't starve the server.
- **Updates only touch F Cartel's containers**, health-check the new version,
  and put the previous one back automatically if anything fails.

## 1. Before you start

**DNS.** In hPanel → **Domains** → `divtech.cloud` → **DNS / Nameservers** →
**DNS records**, add:

| Type | Name | Points to | TTL |
|---|---|---|---|
| A | `fcartel` | your VPS IPv4 (hPanel → VPS → Overview) | default |
| AAAA | `fcartel` | your VPS IPv6, only if your other sites use one | default |

(If the domain's DNS is managed elsewhere, e.g. Cloudflare, add the record
there instead.)

**The first image.** After this change is merged, GitHub → **Actions** →
**Publish Docker images** runs (about 10–15 minutes). Its summary page shows
the version to start with, e.g. `FCARTEL_VERSION=sha-1a2b3c4`.

**A GitHub token** so the VPS can download the private repository and images:
GitHub → your avatar → **Settings** → **Developer settings** → **Personal
access tokens** → **Tokens (classic)** → **Generate new token (classic)**,
with the scopes **`repo`** and **`read:packages`**. Copy it.

**Docker on the VPS.** SSH in (hPanel → VPS → Overview → SSH access, or the
browser terminal) and check:

```bash
docker --version && docker compose version
```

If Docker is missing, install it with `curl -fsSL https://get.docker.com | sudo sh`.
Installing Docker doesn't restart or change your running sites.

## 2. Install

```bash
sudo mkdir -p /opt/fcartel && sudo chown "$USER" /opt/fcartel
git clone https://<YOUR_GITHUB_TOKEN>@github.com/GanatraDeep/restaurant_management.git /opt/fcartel/app
cd /opt/fcartel/app/deploy
sudo ./setup.sh
```

The first run creates `deploy/.env` with generated secrets and stops. Open it
(`sudo nano .env`) and fill in:

| Setting | Value |
|---|---|
| `FCARTEL_VERSION` | the tag from the Actions summary, e.g. `sha-1a2b3c4` |
| `REGISTRY_TOKEN` | the GitHub token from step 1 |
| `SUPER_ADMIN_EMAILS` | the email you'll sign up with to run the platform |
| `LETSENCRYPT_EMAIL` | where certificate expiry notices go |
| `RAZORPAY_*` | your Razorpay keys (can be added later) |
| `FCARTEL_PORT` | leave `3095` unless something already uses it |

Then run it again:

```bash
sudo ./setup.sh
```

It checks the server, starts the containers, shows you the nginx site it will
add and asks before adding it, then gets the HTTPS certificate. When it says
**Done**, open <https://fcartel.divtech.cloud> and sign up with the
`SUPER_ADMIN_EMAILS` address — that account gets **Admin console** in the
sidebar.

> **Not using nginx?** If ports 80/443 are served by something else
> (Apache, OpenLiteSpeed/CyberPanel, Caddy, Traefik, a control panel), the
> script changes nothing and stops after starting F Cartel. Add a reverse
> proxy for `fcartel.divtech.cloud` → `http://127.0.0.1:3095` in that tool
> (enable WebSocket support), then use `sudo ./setup.sh --skip-nginx` for
> future runs. Panels like CloudPanel have a "Reverse Proxy" site type for
> exactly this.

## 3. Connect GitHub → Releases

So each new version shows up in **Admin console → Releases** by itself:
GitHub → repository **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**, twice:

| Name | Value |
|---|---|
| `RELEASE_WEBHOOK_URL` | `https://fcartel.divtech.cloud/api/v1/releases/announce` |
| `RELEASE_WEBHOOK_SECRET` | the `RELEASE_WEBHOOK_SECRET` value from `deploy/.env` |

## 4. Razorpay webhook

Razorpay Dashboard → **Webhooks** → URL
`https://fcartel.divtech.cloud/api/v1/billing/razorpay/webhook`, events
`payment.captured`, `order.paid`, `payment.failed`, and the secret you put in
`RAZORPAY_WEBHOOK_SECRET`. After changing Razorpay values in `.env`, run
`sudo ./setup.sh --skip-nginx` to apply them.

## Day to day

**Shipping a change:** push (or merge a PR) to `master` → about 10–15 minutes
later it appears under **Admin console → Releases → Waiting for your
decision**, and super admins get a notification. **Deploy to production**
switches over in under a minute; **Skip** leaves it out. If the new version
fails its health checks, the previous one is restored automatically and the
release is marked *Failed — rolled back* with the reason.

**Rolling back:** in **History**, press **Deploy this version** on any
earlier release. Note that database changes made by a newer version stay in
place; the app's migrations only ever add, so older versions keep working.

**Changes to this `deploy/` folder itself** (compose file, updater, nginx
template) aren't part of a release. Apply them with:

```bash
cd /opt/fcartel/app && git pull && cd deploy && sudo ./setup.sh --skip-nginx
```

**Useful commands** (from `/opt/fcartel/app/deploy`):

```bash
docker compose -f docker-compose.prod.yml ps          # status
docker logs -f fcartel-backend                        # API logs
docker compose -f docker-compose.prod.yml restart web # restart one part
docker exec fcartel-postgres pg_dump -U fcartel fcartel | gzip > ~/fcartel-$(date +%F).sql.gz   # manual backup
```

Automatic off-site backups can be switched on in the app under **Settings →
Backup** (S3-compatible storage).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `setup.sh` says port 3095 is in use | Set another free `FCARTEL_PORT` in `.env`, run again. If the nginx site already exists, edit the port in `/etc/nginx/sites-available/fcartel.conf` too, then `sudo nginx -t && sudo systemctl reload nginx`. |
| `pull access denied` / `unauthorized` | `REGISTRY_TOKEN` is wrong or lacks `read:packages`; the `FCARTEL_VERSION` tag doesn't exist yet (check the Actions run). |
| `doesn't resolve yet` | The DNS record isn't live yet; wait a few minutes and run `sudo ./setup.sh` again. |
| Releases says "The updater isn't answering" | `docker compose -f docker-compose.prod.yml up -d updater` |
| Releases page doesn't show new versions | Check the two GitHub secrets; the **announce** step of the Actions run shows the server's answer. You can also add a tag by hand at the bottom of the Releases page. |
| Login or checkout redirects in a loop | The site must be opened over `https://` (cookies are secure-only in production). |
