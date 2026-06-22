# Sim Panel Manager — developer task runner.
#
# The app is an axum API server (server/) + React/Vite frontend. In development
# run TWO processes: the Rust API server AND the Vite dev server (which proxies
# /api to the Rust server). `make dev` starts both together.
#
# Run `make` or `make help` to list the available targets.

MANIFEST := server/Cargo.toml
BIN      := server/target/release/simpanman

# Point this at your local PlatformIO CLI to enable firmware build/upload.
SIMPANMAN_PIO ?=
export SIMPANMAN_PIO

.DEFAULT_GOAL := help
.PHONY: help install dev dev-server dev-web build build-web build-server run test lint fmt clean

help: ## Show this help
	@echo "Sim Panel Manager — make targets:"
	@echo
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "First time:  make install   (then 'make dev')"
	@echo "Linux note:  the serialport crate needs libudev — 'sudo apt-get install libudev-dev'"

install: ## Install frontend deps and pre-fetch Rust crates
	npm install
	cargo fetch --manifest-path $(MANIFEST)

# ── Development (two processes) ───────────────────────────────────────────────

dev: ## Run the API server + Vite dev server together (Ctrl-C stops both)
	@echo "Starting Rust API server (:8787) and Vite dev server (:1420)…"
	@echo "Open http://localhost:1420 once both are up."
	@trap 'kill 0' EXIT; \
		SIMPANMAN_DIST= cargo run --manifest-path $(MANIFEST) & \
		npm run dev & \
		wait

dev-server: ## Run ONLY the Rust API server (API-only, no static UI)
	SIMPANMAN_DIST= cargo run --manifest-path $(MANIFEST)

dev-web: ## Run ONLY the Vite dev server (needs the API server running too)
	npm run dev

# ── Production build ──────────────────────────────────────────────────────────

build: build-web build-server ## Build the frontend and the release server binary

build-web: ## Build the React frontend into dist/
	npm run build

build-server: ## Build the optimized release server binary
	cargo build --release --manifest-path $(MANIFEST)

run: build-web ## Build the UI, then run the server (serves dist/ and opens your browser)
	cargo run --release --manifest-path $(MANIFEST)

# ── Quality ───────────────────────────────────────────────────────────────────

test: ## Run Rust tests, TypeScript type check, and Playwright E2E tests
	cargo test --manifest-path $(MANIFEST)
	npx tsc --noEmit
	npm run test:e2e

lint: ## Run clippy, ESLint (React hooks), and the TypeScript type check
	cargo clippy --all-targets --manifest-path $(MANIFEST) -- -D warnings
	npm run lint
	npx tsc --noEmit

fmt: ## Format Rust code
	cargo fmt --manifest-path $(MANIFEST)

clean: ## Remove build artifacts
	cargo clean --manifest-path $(MANIFEST)
	rm -rf dist playwright-report test-results
