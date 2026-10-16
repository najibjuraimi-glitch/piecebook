# Cloudflare setup: private Piecebook with cloud sync

What this builds, in one picture:

```
phone / laptop ──login (email PIN)──▶ Cloudflare Access ──▶ piecebook.pages.dev  (Pages: the app)
                                                              └─ /api/* ──service binding──▶ piecebook-vision (Worker)
agents on the Linux box ──service token──▶ Cloudflare Access ──▶ piecebook.pages.dev/api/*        ├─ /check  → Gemini
                                                                                                   └─ /sync   → KV USER_DATA
```

- One hostname for the browser (`piecebook.pages.dev`). `/api/*` is a Pages Function
  (`functions/api/[[path]].js`) that forwards to the Worker over a service binding, so the
  Access cookie is first-party and the Worker receives the signed Access JWT.
- The Worker verifies that JWT itself (`worker/src/access.js`). Nothing trusts the
  `Cf-Access-Authenticated-User-Email` header on its own.
- Cloud data lives in KV, one entry per `piecebook.*` key per identity. A service token
  reads as `OWNER_EMAIL`, read-only unless `SERVICE_TOKEN_WRITE = "1"`.
- Cost: Pages free, Workers free tier, KV free tier, Zero Trust Free (up to 50 users). Gemini as today.

**Who can do what.** Steps are marked:

- **[API ✓]** — Code can run it from the box with the existing *Edit Cloudflare Workers* API
  token (`CLOUDFLARE_API_TOKEN` in the environment; that template covers Workers Scripts, Workers
  KV, and account read).
- **[API +perm]** — scriptable, but only with a token that also has the named permission.
- **[Dashboard]** — a click Jib makes. Each one says exactly where.

Do them in order. Nothing breaks until step 8 flips the Worker to "Access required".

---

## 0. Before starting

- Cloudflare account `dd046e58e703dcb6cc96aa78d2fc13e5` (already in `worker/wrangler.toml`).
- Code has `CLOUDFLARE_API_TOKEN` set, has run `npm ci` at the repo root (that installs `wrangler`;
  there is no `package.json` in `worker/`), and `npx wrangler whoami` works.
- The GitHub repo may stay public or go private; Pages only needs read access to it.

## 1. Zero Trust team  **[Dashboard]**

1. Open <https://one.dash.cloudflare.com>. First visit asks for a **team name**; pick e.g. `jib`.
   The team domain becomes `https://jib.cloudflareaccess.com` — write it down, it is `ACCESS_TEAM_DOMAIN`.
2. Plan: **Zero Trust Free**. Cloudflare asks for a payment method on file even at US$0.
3. Zero Trust → **Settings → Authentication → Login methods**: confirm **One-time PIN** is listed
   (it is on by default). No identity provider is needed.

## 2. Pages project from the GitHub repo  **[Dashboard]**

The Git connection needs the GitHub app authorisation, which only a browser session can do.

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick `najibjuraimi-glitch/piecebook`. Production branch `main`.
3. Build settings:
   - Framework preset: **Vite** (or None)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/`
   - Node version: the repo's `.node-version` file (`22`) is what Pages uses. Dashboard
     environment variables such as `NODE_VERSION` are ignored while a root `wrangler.toml` exists.
4. Project name `piecebook` → site is `https://piecebook.pages.dev`. If that name is taken and
   you pick another, note the hostname: it must go into `ALLOWED_ORIGINS` (step 8) and into the
   "moved" banner (step 11).
5. **Save and Deploy**. The repo's root `wrangler.toml` tells Pages to bind the Worker as
   `VISION` for the `/api/*` function; the `functions/` folder is picked up automatically.
6. Check: `https://piecebook.pages.dev/api/health` →
   `{"ok":true,"model":"…","access":"off","sync":"off"}`. If you see `api_not_bound`, go to the Pages
   project → **Settings → Bindings → Service bindings** and add `VISION` → `piecebook-vision` by hand.

At this point the new site works exactly like the old one (public, local-only data).

## 3. KV namespace for cloud data  **[API ✓]**

```bash
npx wrangler kv namespace create USER_DATA --config worker/wrangler.toml
```

Copy the printed `id` into `worker/wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "USER_DATA"
id = "<the id>"
```

*Done:* the live namespace `fbb335c717da4e0e98ffd433cb702ca2` is committed. Only repeat this
step if you deliberately start a fresh store.

(D1 would also work; KV was chosen because each key is one small JSON blob and there is no
query to run. Switching later means only `worker/src/sync.js`.)

## 4. Service token for the agents  **[Dashboard]** (or **[API +perm]** `Access: Service Tokens: Edit`)

1. Zero Trust → **Access → Service Auth → Service Tokens → Create Service Token**.
2. Name `piecebook-agents`, duration 1 year (or Non-expiring). Create.
3. Copy **Client ID** and **Client Secret** now; the secret is shown once.
4. On the Linux box, as the user the agents run as:

   ```bash
   install -m 600 /dev/null ~/.config/piecebook-agents.env
   cat > ~/.config/piecebook-agents.env <<'EOF'
   CF_ACCESS_CLIENT_ID=<client id>.access
   CF_ACCESS_CLIENT_SECRET=<client secret>
   PIECEBOOK_API=https://piecebook.pages.dev/api
   EOF
   ```

   API equivalent: `POST /accounts/{account_id}/access/service_tokens` with `{"name":"piecebook-agents","duration":"8760h"}`.

## 5. Access application for the site  **[Dashboard]** (or **[API +perm]** `Access: Apps and Policies: Edit`)

Do **not** use the Pages project's "Access policy" toggle: it protects only the preview
hostnames (`*.piecebook.pages.dev`), not production.

1. Zero Trust → **Access → Applications → Add an application → Self-hosted**.
2. Application name `Piecebook`. Session duration **1 month**.
3. Application domain: `piecebook.pages.dev`. **Add a domain** → `*.piecebook.pages.dev` (previews).
4. Identity providers: One-time PIN only.
5. Policies — add two:
   - `Jib` · Action **Allow** · Include → **Emails** → `najibjuraimi@gmail.com`
   - `Agents` · Action **Service Auth** · Include → **Service Token** → `piecebook-agents`
6. Settings tab: leave cookie settings default (HttpOnly on, SameSite Lax is fine, the API is same-origin).
7. Save. On the application's **Overview** tab copy the **Application Audience (AUD) Tag**. This is
   the first value of `ACCESS_AUD`.

Check: open `https://piecebook.pages.dev` in a private window → Access login page → email PIN → app.

## 6. Access application for the Worker hostname  **[Dashboard]** — recommended, not required

The Worker refuses anything without a valid JWT once step 8 is done, so `workers.dev` is already
closed. This step additionally puts the login page in front of `/health` and lets you (or the
agents) call `https://piecebook-vision.najibjuraimi.workers.dev` directly.

1. Workers & Pages → `piecebook-vision` → **Settings → Domains & Routes** → the `workers.dev` row →
   **Enable Cloudflare Access**. That creates a self-hosted app for the hostname.
2. Open it in Zero Trust → Applications and give it the same two policies as step 5.
3. Copy its **AUD tag** — the second value of `ACCESS_AUD`.

## 7. Worker variables  **[API ✓]** (a file edit + deploy)

Edit `worker/wrangler.toml` and fill:

```toml
ACCESS_TEAM_DOMAIN = "https://jib.cloudflareaccess.com"
ACCESS_AUD = "<aud from step 5>,<aud from step 6>"     # one value is fine if step 6 was skipped
OWNER_EMAIL = "najibjuraimi@gmail.com"
SERVICE_TOKEN_WRITE = "0"
ALLOWED_ORIGINS = "https://najibjuraimi-glitch.github.io,https://piecebook.pages.dev,https://*.piecebook.pages.dev"
```

Commit that change (the values are not secrets; the Gemini key stays a `wrangler secret`).

*Done:* the live values (team `piecebook.cloudflareaccess.com`, the Pages app's AUD, read-only
service token) are committed, so `npm run worker:deploy` from any checkout keeps the lock on. If the
Access application is ever recreated, its new AUD tag must land here before the next deploy.

## 8. Deploy the Worker  **[API ✓]** — this is the switch

```bash
npm ci                    # installs wrangler at the repo root; nothing to install in worker/
npm run worker:deploy     # = wrangler deploy --config worker/wrangler.toml
curl -s https://piecebook-vision.najibjuraimi.workers.dev/health
#   {"ok":true,"model":"…","access":"on","sync":"on"}   (or an Access login page if step 6 is on)
curl -s -o /dev/null -w '%{http_code}\n' https://piecebook-vision.najibjuraimi.workers.dev/sync
#   401 (or 302 to the login page if step 6 is on)
```

From the Linux box, as an agent:

```bash
set -a; . ~/.config/piecebook-agents.env; set +a
curl -s -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" "$PIECEBOOK_API/whoami"
#   {"identity":"najibjuraimi@gmail.com","kind":"service","readOnly":true}
```

**What stops working now, on purpose:** the photo check on the old GitHub Pages site (it calls
the Worker without an Access session). Everything else on the old site still runs locally.

## 9. First login and carrying the data over  **[Jib, in the browser]**

1. On the **old** site (`https://najibjuraimi-glitch.github.io/piecebook/`): Collection → **Your data**
   → **Download backup** (goes to Downloads / Files on iPhone). Do this once per device that has data.
2. On the **new** site: log in. If this browser is empty, nothing is offered yet. Go to **Your data**
   → **Choose backup file** → read the confirm → **Replace and import**.
3. A banner then says *Your data is only on this device* → **Upload to cloud**. That is the one-tap
   first-login upload. From now on every change writes through within a second; other devices pick
   it up when their tab comes back to the front.
4. Repeat only the login on other devices; they pull the cloud copy. Data that was on those devices
   from before sync loses to the cloud copy key-by-key (export it first if any of it matters).

## 10. Agents reading the data  **[Linux box]**

```bash
H=(-H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET")
curl -s "${H[@]}" "$PIECEBOOK_API/sync" | jq '.docs["piecebook.v1"].value.owned'        # collection
curl -s "${H[@]}" "$PIECEBOOK_API/sync/piecebook.pregrade.v1" | jq '.doc.value'          # pre-grade log
curl -s "${H[@]}" -X POST "$PIECEBOOK_API/check" -H 'Content-Type: application/json' \
     -d '{"front":"data:image/jpeg;base64,…","back":"data:image/jpeg;base64,…"}'          # photo check (counts against the daily cap)
```

Keys: `piecebook.v1` (collection + costs), `piecebook.decks.v1`, `piecebook.watchlist.v1`,
`piecebook.pregrade.v1`, `piecebook.displayCurrency.v1`, `piecebook.readerCutoff.v1`,
`piecebook.started.v1`. Each doc is `{ value, updatedAt }`.

Writes from agents are refused (`403 read_only`) until `SERVICE_TOKEN_WRITE = "1"` is set and the
Worker redeployed. If that is ever turned on, agents must send the current ISO time as `updatedAt`
or their write loses to the phone under last-write-wins.

## 11. The old site: banner, then retirement

- Turn the "we moved" banner on without touching code **[API ✓ with `gh`]**:

  ```bash
  gh variable set PIECEBOOK_MOVED_TO --body https://piecebook.pages.dev --repo najibjuraimi-glitch/piecebook
  gh workflow run pages.yml --repo najibjuraimi-glitch/piecebook
  ```

  (Dashboard: repo → Settings → Secrets and variables → Actions → Variables.) The banner carries a
  **Download my data** button and a link to the new home.
- After every device has imported: delete `.github/workflows/pages.yml` and `.github/pages/404.html` in a
  follow-up PR, and GitHub → Settings → Pages → Source → **None** **[Dashboard]**.
- Optionally make the repo private **[Dashboard]**; Pages keeps building.

---

## Local development

```bash
# terminal 1 — the Worker with a fake identity and on-disk KV
printf 'ACCESS_DEV_IDENTITY=najibjuraimi@gmail.com\nGEMINI_API_KEY=<key>\n' > worker/.dev.vars   # git-ignored
npm run worker:dev        # = wrangler dev --config worker/wrangler.toml --env dev

# terminal 2 — the app; Vite proxies /api to :8787
npm run dev
```

`ACCESS_DEV_IDENTITY` is honoured only when the request host is `localhost` / `127.0.0.1`.

## If something is wrong

| Symptom | Look at |
|---|---|
| `/api/health` says `api_not_bound` | Pages → Settings → Bindings → Service binding `VISION` → `piecebook-vision` |
| Your data screen says *Cloud sync is off* | Worker `/health` shows `access:"off"` or `sync:"off"` → step 3 or step 7 not deployed |
| A photo check fails | `npm run worker:tail` and read the `check_model_output` line: `reason` + `finishReason` name the shape the model returned |
| `wrangler: command not found` | Run `npm ci` at the repo root; wrangler is a root devDependency and every `worker:*` script passes `--config worker/wrangler.toml` |
| Browser shows *Signed out* right after logging in | `ACCESS_AUD` does not contain the AUD of the app that issued the cookie (step 5's tag) |
| Agent gets a 302 / HTML login page | Policy `Agents` is not **Service Auth**, or the token is not in its Include list |
| Agent gets `401 unauthorized` from the Worker directly | Step 6 not done, so no JWT is minted on workers.dev; call via `piecebook.pages.dev/api` instead |
| `origin_not_allowed` | Pages hostname differs from `piecebook.pages.dev`; add it to `ALLOWED_ORIGINS` |
| Old GitHub Pages site says *On this device* and never syncs | By design: its build sets `VITE_SYNC=off` and `VITE_API_BASE` to the Worker URL (`.github/workflows/pages.yml`) |
