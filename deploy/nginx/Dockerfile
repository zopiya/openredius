# OpenRedius frontend — multi-stage bun build + nginx (docs/07)
#   docker build -f deploy/nginx/Dockerfile -t openredius/frontend .
FROM oven/bun:1-slim AS build
WORKDIR /build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . ./
ENV VITE_API_BASE=
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
