# Backend only. The frontend is a static bundle and deploys separately —
# see DEPLOY.md.
#
# Node 22 because server/ uses ESM throughout and the built-in fetch.
FROM node:22-slim AS deps

WORKDIR /app

# Copy manifests first so `npm ci` is cached and only re-runs when a dependency
# actually changes, rather than on every source edit.
COPY package.json package-lock.json ./

# --omit=dev leaves out vite, vitest and the test-only mongodb-memory-server,
# which alone would pull a ~100MB mongod binary into the image.
RUN npm ci --omit=dev

FROM node:22-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
# The backend imports three shared modules from src/lib — the decision
# pipeline and market stress scoring, which run identically in the browser
# simulator and the server bot. See "One deliberate crossover" in the README.
COPY src/lib ./src/lib

# The base image ships an unprivileged `node` user. Running as root in a
# container that reaches the internet and holds an exchange API key is a
# needless amount of authority.
USER node

EXPOSE 5000

# No secrets are baked in. Everything sensitive — MONGODB_URI, DELTA_API_KEY,
# DELTA_API_SECRET, DELTA_VAULT_KEY, GEMINI_API_KEY — is injected at runtime by
# the platform. A key in an image layer is a key in every registry that image
# is pushed to.
CMD ["node", "server/index.js"]
