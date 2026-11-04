# 安窝 Anwo — single-container production image (API + built web + SQLite file).
# Build:  docker build -t anwo .
# Run:    docker run -p 4000:4000 -e JWT_SECRET=<32+ random bytes> -e WEB_ORIGIN=https://your.domain -v anwo-data:/app/server/data -v anwo-uploads:/app/server/uploads anwo
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4000 DB_PATH=/app/server/data/app.db UPLOAD_DIR=/app/server/uploads
COPY --from=build /app /app
RUN npm prune --omit=dev --no-audit --no-fund 2>/dev/null || true
EXPOSE 4000
# Seeds the demo data on first start (idempotent), then serves API + web/dist with SPA fallback.
CMD ["sh", "-c", "npm run seed >/dev/null 2>&1; npm start"]
