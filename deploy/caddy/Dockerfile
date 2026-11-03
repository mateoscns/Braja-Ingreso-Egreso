# syntax=docker/dockerfile:1.7
# Caddy image with the PWA built in (CLAUDE.md rules 30-31, 34). Build context: the repository root
# (see deploy/docker-compose.yml); Dockerfile.dockerignore next to this file keeps the context to the frontend sources.

FROM node:24-bookworm-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM caddy:2.11-alpine
COPY deploy/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend /frontend/dist /srv
# Fails the build on a Caddyfile error; the real domain comes from the environment at runtime.
RUN BRAJA_DOMAIN=build.invalid caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
