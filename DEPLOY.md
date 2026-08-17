# Deploying Venture DAO

Three pieces, deployed separately:

| Piece | Where | Why there |
|---|---|---|
| Database | MongoDB Atlas | managed, and gives you an IP allowlist |
| Backend | Render (or Fly.io) | needs a long-running process **and a static outbound IP** |
| Frontend | Vercel | static bundle; `vercel.json` is already configured |

---

## The constraint that decides everything

**Delta whitelists API keys by IP.** Your server's outbound address must be
fixed and whitelisted, or every authenticated call fails — balances, positions,
orders, all of it.

That single requirement rules out most free tiers:

- **Render free** — dynamic egress IP, and instances sleep when idle. Both
  fatal: the IP rotates and breaks auth, and a sleeping instance stops the bot
  without telling you. Static outbound IPs start at the **Starter** plan.
- **Railway** — static egress requires a paid plan.
- **Fly.io** — a dedicated IPv4 is a paid add-on, but works well.
- **Vercel / Netlify functions** — serverless, no fixed IP, no long-running
  process. Wrong shape for this entirely.

Budget for a paid backend tier. There is no free path that satisfies Delta.

---

## Order of operations

The sequence matters. Each step depends on the one before it.

### 1. Database

Create a free **M0 cluster** on MongoDB Atlas, a database user, and — under
Network Access — allow **only your backend's IP**, never `0.0.0.0/0`.

Copy your local data up:

```bash
MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net" \
  node server/scripts/renameDatabase.js --from venture-dao --to venture-dao
```

It verifies document counts on both sides and leaves the source untouched.

### 2. Rotate every secret

Your current keys have lived in a development `.env` on a laptop. Generate new
ones for production and do not reuse the old:

- **Delta** — create a fresh API key in the Delta console
- **Gemini** — new key at <https://aistudio.google.com/apikey>
- **`DELTA_VAULT_KEY`** — *do not rotate this one* if you are carrying existing
  data across. It is the AES-256-GCM key that sealed those records; a different
  value makes every one of them permanently unreadable.

Generate a fresh vault key only for a fresh database:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Backend (Render)

1. In Render Dashboard: **New → Web Service** (or **Blueprint** with `backend/render.yaml`).
2. Point at your repo, and configure:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Set `MONGODB_URI`, `MONGODB_DB`, `DELTA_VAULT_KEY`, `DELTA_API_KEY`, `DELTA_API_SECRET`, `GEMINI_API_KEY`, `CORS_ORIGIN`.
3. Find your service's **static outbound IP** in Render's settings and add it to your Delta Exchange API key IP whitelist.

### 4. Verify before trusting it

From the deployed backend server's shell:

```bash
npm run preflight
```

Read-only — it places nothing. It checks the environment switches, that the key
authenticates, that the IP is whitelisted, and that your order caps were set
deliberately rather than left at defaults.

### 5. Frontend (Vercel)

1. In Vercel Dashboard: **Add New Project** and select this repository.
2. In Project Settings:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. In Environment Variables:
   - `VITE_API_URL`: `https://your-backend-service.onrender.com` (your Render backend URL)
4. Deploy! Then update `CORS_ORIGIN` on your Render backend to match your Vercel URL (e.g. `https://venture-dao.vercel.app`).

---

## Before it is public

- [ ] All secrets rotated, none in git (`.env` is gitignored; verify with `git ls-files | grep env`)
- [ ] `CORS_ORIGIN` is your real domain, not `localhost:5173`
- [ ] HTTPS everywhere — the session cookie sets `Secure` automatically off local HTTP, and a `Secure` cookie over plain `http://` is silently dropped
- [ ] Atlas network access is your backend's IP only
- [ ] Delta API key whitelists the **server's** IP, not your laptop's
- [ ] `DELTA_MAX_ORDER_NOTIONAL` chosen deliberately, not left at 100
- [ ] You know the kill switch: set `DELTA_KILL_SWITCH=true`, redeploy, and every order-placing route is blocked
- [ ] `npm run preflight` passes from the deployed server

---

## Turning on real money

Two switches, both required:

```
DELTA_ENV=live
DELTA_ALLOW_LIVE=true
```

Either alone falls back to testnet. That is deliberate — one typo should not
start moving funds.

Before you set them, what this project measured on its own data:

- **profit factor 0.94** — below 1.0 loses money, and it stayed below with fees zeroed
- **31 winning trades out of 31, account down 6.16%** — fees were four times the gross profit
- **0 of 2,000 simulated runs** reached the goal; every one hit the loss limit first
- the trained model has **negative out-of-sample lift** on every market tested
- news sentiment has **not yet been measured at all** and votes with weight zero

Nothing in here has demonstrated an edge. Deploying in testnet mode is genuinely
useful — it runs, it accumulates sentiment evidence, and you can watch it decide.
Live is a separate decision, and it is yours.
