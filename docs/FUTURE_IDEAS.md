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
