# Build context: collabfm-radio/ (repo root)

FROM node:22-bookworm-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim AS backend-build
WORKDIR /build/backend
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=frontend-build /build/frontend/dist ./dist

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        libopus0 \
        ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ENV WEB_PORT=4002 \
    WS_PORT=4001 \
    PCM_RELAY_PORT=4100 \
    COLLABFM_RUNTIME=docker \
    NODE_ENV=production

COPY --from=backend-build /build/backend /usr/share/collabfm
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /usr/src/app
EXPOSE 4001 4002 4100

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "bot.js"]
