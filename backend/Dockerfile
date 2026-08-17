# Backend Dockerfile for Render / Fly.io deployment
FROM node:22-slim AS deps

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

FROM node:22-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

USER node

EXPOSE 5000

CMD ["node", "index.js"]

