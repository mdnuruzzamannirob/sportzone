# Build from repository root: docker build -f backend/Dockerfile -t sportzone-backend:<revision> .
FROM node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS base

FROM base AS tooling
WORKDIR /app
RUN npm install --global npm@11.19.0 --ignore-scripts --no-audit --no-fund
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json

FROM tooling AS build
RUN npm ci --workspace=backend --include-workspace-root=false --ignore-scripts --no-audit --no-fund
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/src ./backend/src
COPY backend/scripts/build.mjs ./backend/scripts/build.mjs
RUN npm run build --workspace=backend

FROM tooling AS production-dependencies
RUN npm ci --workspace=backend --include-workspace-root=false --omit=dev --ignore-scripts --no-audit --no-fund \
    && mkdir -p backend/node_modules

FROM base AS runtime
ENV NODE_ENV=production API_BIND_HOST=0.0.0.0 PORT=4000
WORKDIR /app/backend
COPY --from=production-dependencies /app/node_modules /app/node_modules
COPY --from=production-dependencies /app/backend/package.json ./package.json
COPY --from=production-dependencies /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY backend/scripts/notification-worker.mjs backend/scripts/expire-reservations.mjs backend/scripts/container-health.mjs backend/scripts/staging-inventory.mjs backend/scripts/staging-catalog.mjs ./scripts/
USER node
EXPOSE 4000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 CMD ["node", "scripts/container-health.mjs"]
ENTRYPOINT ["node"]
CMD ["dist/server.js"]
