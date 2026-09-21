# Explicit build instead of buildpack detection.
#
# Nixpacks has to guess at the application type, and when it guesses wrong the
# error tells you nothing useful about why. A kiosk that has to come up reliably
# in a venue's rack deserves a build that is the same every time and readable by
# whoever is on site.

# ---- build ------------------------------------------------------------------
FROM node:20-slim AS build
WORKDIR /app

# Dependencies first, so a source-only change does not reinstall the tree.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Drop the build toolchain. The bundle externalises anything outside its
# allowlist, so the runtime genuinely needs node_modules — just not the dev half
# of it. Verified the built bundle requires only pg, @aws-sdk/client-s3 and
# dotenv, all of which are production dependencies.
RUN npm ci --omit=dev

# ---- runtime ----------------------------------------------------------------
FROM node:20-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# curl is not a convenience here: server/kie.ts and server/ingest.ts shell out to
# it rather than using Node fetch, so the image is broken without it. Kept in the
# runtime stage deliberately.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# Run unprivileged. The node image ships a `node` user; nothing here needs root.
USER node

EXPOSE 3000

# Checks the database, not just that the process is listening. A container that
# answers on the port but cannot reach Postgres is useless to a kiosk.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT}/api/health > /dev/null || exit 1

CMD ["node", "dist/index.cjs"]
