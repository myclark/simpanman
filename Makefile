# Sim Panel Manager — developer task runner.
#
# The app is an Electron desktop app: a React/Vite renderer + a TypeScript main
# process (electron/) that hosts the ported project engine, plus a small native
# Rust helper (helper/) for serial enumeration and PlatformIO build/upload.
#
# Run `make` or `make help` to list the available targets.

HELPER_MANIFEST := helper/Cargo.toml

# Point this at your local PlatformIO CLI to enable firmware build/upload in dev.
SIMPANMAN_PIO ?=
export SIMPANMAN_PIO

.DEFAULT_GOAL := help
.PHONY: help install dev build build-renderer build-electron build-helper dist run test test-engine test-e2e test-smoke lint typecheck fmt clean

help: ## Show this help
	@echo "Sim Panel Manager — make targets:"
	@echo
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "First time:  make install   (then 'make dev')"
	@echo "Linux note:  the serialport crate needs libudev — 'sudo apt-get install libudev-dev'"

install: ## Install frontend deps and pre-fetch Rust crates
	npm install
	npx playwright install chromium
	cargo fetch --manifest-path $(HELPER_MANIFEST)

# ── Development ───────────────────────────────────────────────────────────────

dev: build-helper ## Run Vite + Electron together (Ctrl-C stops both)
	npm run dev

# ── Build ─────────────────────────────────────────────────────────────────────

build: build-renderer build-electron build-helper ## Build renderer, main process, and helper

build-renderer: ## Build the React renderer into dist/
	npm run build:renderer

build-electron: ## Bundle the Electron main + preload into dist-electron/
	npm run build:electron

build-helper: ## Build the native Rust helper binary
	cargo build --release --manifest-path $(HELPER_MANIFEST)

dist: build ## Build and package installers with electron-builder
	npm run dist

run: build ## Build everything and launch the packaged-style app
	npx electron .

# ── Quality ───────────────────────────────────────────────────────────────────

test: test-engine ## Run engine unit tests (alias for test-engine)

test-engine: ## Run the vitest engine unit/snapshot tests
	npm run test

test-e2e: ## Run the Playwright E2E tests
	npm run test:e2e

test-smoke: build ## Build the app and run the Electron smoke tests
	npm run test:smoke

lint: ## Run ESLint, the TypeScript checks, and clippy
	npm run lint
	npm run typecheck
	cargo clippy --all-targets --manifest-path $(HELPER_MANIFEST) -- -D warnings

typecheck: ## Type-check renderer and electron/engine
	npm run typecheck

fmt: ## Format Rust code
	cargo fmt --manifest-path $(HELPER_MANIFEST)

clean: ## Remove build artifacts
	cargo clean --manifest-path $(HELPER_MANIFEST)
	rm -rf dist dist-electron release playwright-report test-results
