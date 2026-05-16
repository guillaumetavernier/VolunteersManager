# VolunteersManager Makefile. Tabs, not spaces.

GO       ?= go
PNPM     ?= pnpm
PORT     ?= 8080

.PHONY: help
help:
	@echo "make dev      — run backend + Vite dev server (proxied)"
	@echo "make build    — produce ./dist/volunteers (frontend embedded)"
	@echo "make test     — go test + vitest"
	@echo "make typecheck— pnpm typecheck"
	@echo "make lint     — go vet + staticcheck (if installed)"
	@echo "make tidy     — go mod tidy + pnpm install"
	@echo "make check    — ./scripts/harness/check.sh"
	@echo "make clean    — remove dist/, web/dist/, *.db"

.PHONY: dev
dev:
	$(MAKE) -j 2 dev-frontend dev-backend

.PHONY: dev-frontend
dev-frontend:
	cd web && $(PNPM) dev

.PHONY: dev-backend
dev-backend:
	$(GO) run ./cmd/volunteers --port=$(PORT) --frontend-proxy=http://localhost:5173

.PHONY: build
build:
	./scripts/build.sh

.PHONY: test
test:
	$(GO) test ./...
	cd web && $(PNPM) test --run

.PHONY: typecheck
typecheck:
	cd web && $(PNPM) typecheck

.PHONY: lint
lint:
	$(GO) vet ./...
	@if command -v staticcheck >/dev/null 2>&1; then staticcheck ./...; else echo "(staticcheck not installed; skipping)"; fi
	@if command -v golangci-lint >/dev/null 2>&1; then golangci-lint run; else echo "(golangci-lint not installed; skipping)"; fi

.PHONY: tidy
tidy:
	$(GO) mod tidy
	cd web && $(PNPM) install

.PHONY: check
check:
	./scripts/harness/check.sh

.PHONY: bench
bench:
	$(GO) run ./scripts/bench_constraints.go
	$(GO) run ./scripts/bench_roadbook.go
	node scripts/bench_timeline.mjs

.PHONY: clean
clean:
	rm -rf dist web/dist
	rm -f event.db event.db.bak
