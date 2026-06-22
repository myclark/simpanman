# Sim Panel Manager — developer task runner.
#
# The app is a React/Vite frontend. Run `make dev` to start the Vite dev
# server (http://localhost:1420). The Rust API server is a separate process
# managed outside this repo.
#
# Run `make` or `make help` to list the available targets.

.DEFAULT_GOAL := help
.PHONY: help install dev build test lint fmt clean

help: ## Show this help
	@echo "Sim Panel Manager — make targets:"
	@echo
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "First time:  make install   (then 'make dev')"

install: ## Install frontend dependencies
	npm install

dev: ## Start the Vite dev server (http://localhost:1420)
	npm run dev

build: ## Build the React frontend into dist/
	npm run build

test: ## Run TypeScript type check and Playwright E2E tests
	npx tsc --noEmit
	npm run test:e2e

lint: ## Run ESLint (React hooks) and TypeScript type check
	npm run lint
	npx tsc --noEmit

clean: ## Remove build artifacts
	rm -rf dist playwright-report test-results
