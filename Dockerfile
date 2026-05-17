#syntax=docker/dockerfile:1.7

# --- frontend build ---------------------------------------------------------
FROM node:22-bookworm AS frontend
WORKDIR /src
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json* ./
COPY web/package.json web/
RUN pnpm install --frozen-lockfile --filter ./web...
COPY web/ web/
RUN pnpm --filter ./web build

# --- backend build ----------------------------------------------------------
FROM golang:1.26-bookworm AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /src/web/dist ./web/dist
ARG VERSION=dev
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w -X main.version=${VERSION}" \
    -o /out/volunteers \
    ./cmd/volunteers

# --- runtime ----------------------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=backend /out/volunteers /app/volunteers
COPY LICENSE /app/LICENSE
ENV HOME=/app
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/volunteers", "--bind=0.0.0.0", "--port=8080", "--open=false", "--data-dir=/data"]
