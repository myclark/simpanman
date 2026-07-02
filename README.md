# Sim Panel Manager

Desktop app for designing custom sim-cockpit control panels, wiring their controls to
Arduino boards/pins, and generating + uploading the firmware — no hand-written code.
See `docs/TECHNICAL_SPEC.md` for the full design.

## For users

Download the installer for your OS from the [Releases page](https://github.com/myclark/simpanman/releases)
(`.dmg`/`.zip` for macOS, `.exe` for Windows, `.AppImage` for Linux), install, and launch
"Sim Panel Manager". The app checks GitHub Releases for updates automatically.

## For developers

Requires Node 20.x and a Rust toolchain (for the native helper).

```bash
make install   # npm deps + Playwright Chromium + fetch Rust crates
make dev       # run the app (Vite + Electron)
```

Other useful targets: `make test` (engine unit tests), `make test-e2e` (Playwright),
`make lint`, `make build` (production build), `make help` (full list).

See `CLAUDE.md` for architecture details.
