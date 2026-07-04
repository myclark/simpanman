# Future Ideas

Ideas deliberately scoped out of a targeted feature/upgrade, kept here so they
don't get forgotten. Not a backlog with priorities or timelines — just a
parking lot. When one of these gets picked up, it should go through its own
brainstorm/spec, same as any other feature.

## Bundle PlatformIO Core into the app

`docs/TECHNICAL_SPEC.md` §2 originally specified PlatformIO Core as bundled
in app resources ("Do not install at runtime"), with the helper resolving it
via `SIMPANMAN_PIO` (the packaged app would set this to the bundled binary).
That was never built — today `SIMPANMAN_PIO` just points dev builds at
whatever `pio` happens to be on the developer's machine, and the shipped
build-process design (see
`docs/superpowers/specs/2026-07-04-staged-build-process-design.md`) detects a
system PlatformIO install instead of bundling one.

Bundling would remove the "PlatformIO not found" UX path entirely and pin an
exact toolchain version, at the cost of real packaging work: a pinned
PlatformIO Core + AVR toolchain per target platform (Windows/macOS/Linux),
shipped in `extraResources`, sized appropriately in the installer.

## Richer board-type catalog

`BoardsView.tsx` picks board type from a 3-item hardcoded dropdown
(`leonardo` / `micro` / `pro_micro`), all sharing one pin profile
(`electron/engine/pins.ts:atmega32u4Profile`) since they're pin-compatible
ATmega32u4 variants. There's no photo, no 2D pinout diagram, and no
enumeration from an external source of truth (e.g. PlatformIO's own board
list).

In addition, just because they share a microcontroller, does not mean that the pins of the microcontroller match the name of the pins on the board itself.
Keep in mind, that the user will see the pins of the board, not the microcontroller.
Some pins may not have been exposed, and some may have been renamed.
This will depend on the board itself, not just the microcontroller.

A richer version would let the user visually confirm which physical board
they're holding (photo) and see a labeled pinout diagram to plug wires in
against, and could be enumerated from a real board database instead of a
static hardcoded list.

## Bump CI off Node 20

`.github/workflows/ci.yml` and `.nvmrc`/`package.json#engines` pin Node 20.x.
GitHub Actions runners now warn on this (Node 20 is deprecated for actions,
being forced onto Node 24 under the hood as of the 2025-09-19 change:
https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/).
Not urgent — CI still passes — but worth bumping the pinned Node version
(and re-verifying `make install`/`make build`/`make test` etc. still work)
before Node 20 support is dropped outright.

In general, it would be a good idea to always have the CI and the project itself match.
This, in that case the we bump to 24, bump everything to 24.
