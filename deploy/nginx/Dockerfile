# OpenRedius frontend — multi-stage bun build + nginx (docs/07)
#   docker build -f deploy/nginx/Dockerfile -t openredius/frontend .
FROM oven/bun:1-slim AS build
WORKDIR /build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . ./
ENV VITE_API_BASE=
# src/api/config.ts: MODE resolves to 'http' only when VITE_API_MODE=http OR
# VITE_API_BASE is non-empty. Prod wants BASE empty (same-origin /api via
# nginx) but MODE must still be forced to 'http' explicitly — leaving this
# unset (as it was before) makes MODE fall through to 'mock', and since Vite
# inlines import.meta.env.* at build time, every resource module's real
# fetch("/api/...") call gets dead-code-eliminated entirely: v0.2.0–v0.3.1 all
# shipped a console where nothing but /api/auth/login ever reached the real
# backend (confirmed by grepping the built bundle: zero occurrences of
# /api/devices, /api/users, /api/policies, /api/sessions, /api/reports, etc.)
ENV VITE_API_MODE=http
RUN bun run build

FROM nginx:alpine
RUN apk add --no-cache openssl
RUN addgroup -S openredius && adduser -S openredius -G openredius
COPY --from=build /build/dist/ /usr/share/nginx/html/
COPY deploy/nginx/nginx.conf /etc/nginx/nginx.conf
COPY deploy/nginx/generate-certs.sh /docker-entrypoint.d/30-generate-certs.sh
RUN chmod +x /docker-entrypoint.d/30-generate-certs.sh
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
