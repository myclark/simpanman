# Sim Panel Manager — developer & user task runner.
#
# The app is a local Rust server (axum) that serves a React UI in your browser.
# In development you run TWO processes: the Rust API server AND the Vite dev
# server (which proxies /api to the Rust server). `make dev` starts both.
#
# Run `make` or `make help` to list the available targets.

MANIFEST := src-tauri/Cargo.toml
BIN      := src-tauri/target/release/simpanman

# Point this at your local PlatformIO CLI to enable firmware build/upload from
# the app (e.g. `make run SIMPANMAN_PIO=$(command -v pio)`).
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

dev-server: ## Run ONLY the Rust API server (API-only, no static UI, no browser)
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

test: ## Run Rust tests and the TypeScript type check
	cargo test --manifest-path $(MANIFEST)
	npx tsc --noEmit

lint: ## Run clippy (warnings as errors) and the TypeScript type check
	cargo clippy --all-targets --manifest-path $(MANIFEST) -- -D warnings
	npx tsc --noEmit

fmt: ## Format Rust code
	cargo fmt --manifest-path $(MANIFEST)

clean: ## Remove build artifacts (cargo target/ and dist/)
	cargo clean --manifest-path $(MANIFEST)
	rm -rf dist
