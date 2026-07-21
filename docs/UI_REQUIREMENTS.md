# UI Requirements

**Status:** Functional baseline, derived from `docs/TECHNICAL_SPEC.md` and the current
implementation, for use as an unbiased starting point when rethinking the UI.
**Version:** 1.0 (2026-07-06)

## Purpose and scope

This document describes what a user of Sim Panel Manager **must be able to do**, and
what the app must tell them, in order to go from "I have some switches and encoders
wired to some Arduinos" to "each board is flashed with correct, uniquely-identified
firmware." It intentionally says nothing about layout, visual style, component choice,
or interaction chrome (menus vs. buttons, modal vs. inline, tabs vs. panes, etc.) — that
is exactly what is meant to be reconsidered with fresh eyes. Anywhere the current app
happens to use a grid, a sidebar, or a particular button, treat that as an
implementation detail, not a requirement.

Requirements are grouped by the object or workflow they concern, not by screen —
today's app happens to map roughly one section to one tab (Controls / Boards / Build /
Test), but that grouping is not itself a requirement.

Two things are out of scope for v1 and are called out explicitly in the spec — they are
listed here only so a rethink doesn't accidentally reintroduce or lose that scoping:
2D graphical panel layout, and writing/repairing the sim's own binding files (the user
maps controls inside the sim manually).

---

## 1. Project lifecycle

- The user shall be able to start a brand-new, empty project (given it a name).
- The user shall be able to open an existing project from a file on disk.
- The user shall be able to save the current project to disk, and save it to a new
  location/file ("Save As").
- The user shall always be able to tell, at a glance, which project (if any) is
  currently open, and whether it has unsaved changes.
- A project is a single self-contained file; nothing about the project lives outside
  it (identity assignments, pin usage, etc. are all reproducible from that one file).

## 2. Panels

A panel is a logical grouping of controls (e.g. "Left Console"); it has no bearing on
which board a control lands on.

- The user shall be able to create, rename, and delete panels.
- The user shall be able to define an explicit display/working order for panels.
- Deleting a panel that still contains controls is a destructive action affecting
  those controls; the user shall be warned how many controls will be affected before
  it happens.
- The user shall be able to see, for any panel, which controls belong to it.

## 3. Controls

The control list is the primary workspace — most of a user's time in the app is spent
here. A control is owned by exactly one panel and (once assigned) exactly one board;
panels and boards are otherwise independent of each other.

- The user shall be able to add, edit, and delete controls.
- Every control has: a kind, a human-readable label, optional free-text notes, the
  panel it belongs to, and (optionally, until assigned) the board and pin(s) it's
  wired to.
- A control may be left unassigned to a board/pin while its other properties are
  filled in, and the user shall be able to see at a glance which controls are still
  unassigned.
- The user shall be able to choose one of five control kinds, each with its own
  configuration:
  - **Button** (momentary): one pin, plus whether it's wired normally-open or
    normally-closed.
  - **Switch** (maintained, on/off): one pin, NO/NC, and a user-supplied label for
    each of the two states (e.g. "Master Arm ON" / "OFF").
  - **Selector** (n-position): one logical output per position; each position is
    defined by one or more pins combined with AND/OR logic (each optionally inverted),
    and has its own label (e.g. "OFF" / "STBY" / "ON").
  - **Encoder** (rotary): two pins, and the encoder's quadrature resolution
    (counts/detent). The user chooses one of two output modes per encoder:
    - *Buttons*: a labeled clockwise and counter-clockwise button, each firing a
      configurable number of presses per detent (for sensitivity tuning), with a
      configurable pulse length.
    - *Axis*: accumulates rotation onto a chosen joystick axis, with a configurable
      amount of axis movement per detent, a clamped range, and optional wrap-around.
  - **Analog** (potentiometer/slider): one analog-capable pin, a chosen joystick axis,
    a calibratable input range (raw ADC) mapped to an output range, inversion, and
    (optionally) deadzone/smoothing.
- When assigning a pin, the user shall only be offered pins that are actually free on
  the chosen board (plus whatever pin is already assigned, even if it's since become
  conflicted, so it isn't silently hidden).
- The app shall suggest a sensible default pin (e.g. an interrupt-capable one for a
  new encoder) when a control's kind or board changes, without forcing the user to
  accept it.
- The user shall be able to work through many controls efficiently: view them grouped
  and/or filtered by panel, navigate and edit via the keyboard, and copy/paste or
  fill-down repeated values across rows, rather than being limited to one-at-a-time
  dialog editing.

## 4. Boards

A board represents one physical Arduino; a board's set of assigned controls (across
all panels) is exactly what gets built into its firmware.

- The user shall be able to add, rename, and delete boards.
- The user shall be able to choose a board's type from the supported family of
  compatible microcontroller boards.
- The user shall be able to see and permanently allocate a board's USB identity — a
  unique product name, vendor ID, and product ID — so that two boards of the same
  type never get confused by the sim, including across replugging and rebooting.
- The user shall be able to see, per board, a full picture of its pins: which pins
  are used and by which control (with that control's kind), which pins are still
  free, and which free pins are interrupt-capable (relevant for encoders). Any
  pin-usage warnings (e.g. use of a serial pin) shall be visible here.
- Deleting a board that has controls assigned to it is destructive to those
  assignments; the user shall be warned how many controls will become unassigned
  before it happens.

## 5. Validation

Validation runs continuously against the whole project, not just on demand.

- The user shall be told about **errors** — conditions that block firmware
  generation/build — including: a pin double-booked between two controls on the same
  board, a control referencing a board or panel that no longer exists, an analog
  control assigned to a pin that isn't analog-capable, and a selector position with no
  pins configured.
- The user shall be told about **warnings** — conditions that don't block anything but
  are worth knowing — including: a control using a pin normally reserved for
  serial/USB, an encoder on a pin that isn't interrupt-capable (it'll still work, via
  polling), and a control that isn't assigned to a board/pin yet.
- The user shall be able to see validation results both in aggregate (how many
  errors/warnings exist) and per-item (which control, which pin, what's wrong), and
  shall be able to see the subset of validation results relevant to a specific board
  when working on that board's build.

## 6. Generating, building, and programming firmware

For a given board, this is a progression: turn the model into firmware source, turn
that source into a compiled binary, then get that binary onto the physical board.
Each step depends on the previous one having succeeded, and the app must always make
clear which step a board is currently eligible for.

**Generate & Export**
- The user shall be able to produce the firmware source for a specific board on
  demand, reflecting the current, valid state of the model.
- This shall be blocked while that board has unresolved validation errors (the user
  must be told what to fix); warnings shall be shown but must not block it.
- The user shall be able to get the generated firmware out of the app without
  building inside it — at minimum, by copying the firmware source, or by exporting a
  complete, ready-to-open Arduino-IDE sketch to disk.

**Build**
- The user shall be able to compile a board's generated firmware using the local
  toolchain and see whether it succeeded or failed, with a live, inspectable build
  log.
- If the required toolchain isn't available on the system, the user shall be told
  clearly (this is an environment problem, not a project problem) and given a way to
  install it and re-check.
- The user shall be able to export a complete, standalone build project for a board
  to disk, to build it outside the app entirely.
- On a compile failure, the user shall be able to get the full log, and shall be given
  an easy path to report the failure (it's more likely an app/toolchain bug than a
  mistake in their panel design).

**Program (upload)**
- Programming a board shall only be available after that board has a *current*
  successful build — if the project has changed since the last successful compile,
  the user shall be told a fresh compile is needed rather than being allowed to flash
  stale firmware.
- The user shall be able to select which serial port to program, and shall be able to
  use a guided flow where the app detects a board as it's plugged in rather than
  requiring them to identify the right port manually.
- Before programming over a port, the user shall be told what the app can determine
  about whatever is currently on that port relative to the board they're about to
  flash: e.g. that it already matches this exact board (safe re-flash), that it looks
  like a factory-fresh/never-flashed board, that it currently carries a *different*
  Sim Panel Manager board's or project's identity (requires explicit confirmation
  before overwriting), or that it's unrecognized.
- The user shall be able to trigger the upload and see live progress/success/failure,
  with an inspectable log.
- Every board's generate/build/program flow shall be independent — working with one
  board shall never require waiting on or block another board's flow.

## 7. Live test / verification

*(Described in the spec as a later phase; not yet available to users. Included here
because it's part of the intended end-to-end workflow.)*

- After a board is programmed, the user shall be able to connect it and see it
  recognized as a joystick device.
- The user shall be able to operate their physical controls and see each one's live
  state reflected in the app, so wiring and mapping can be verified before configuring
  the sim itself.

## 8. Application-wide

- The user shall always be able to tell what project is open and whether they have
  unsaved work, from anywhere in the app.
- The user shall be able to move between the major areas of work (describing
  controls, managing boards, building/programming, testing) without losing state in
  the others.
- If a software update becomes available, the user shall be informed and able to
  install it, without that process interrupting whatever they're doing.
- Errors that are about the *application itself* (e.g. a native dialog failing) shall
  be distinguishable from validation errors or build/program failures, which are
  about the *project* or the *hardware*.

---

## Requirements stated in the spec but not yet fully realized

Flagging these so a UI rethink can make a deliberate call to keep, cut, or finally
implement them, rather than losing them by omission:

- **Efficient grid editing.** The spec calls for keyboard navigation, row copy/paste,
  fill-down, and duplicate on the controls list. Today's editing is one control at a
  time via an inline form; none of copy/paste, fill-down, or duplicate exist yet.
- **Autosave / crash protection.** The spec recommends autosave alongside the
  dirty-state indicator. Today the app tracks and shows unsaved-changes state, but
  doesn't autosave and doesn't guard against losing work (no prompt on opening a new
  project or closing over unsaved changes).
- **Recent files.** The spec mentions recent files as part of persistence; there's no
  recent-files access today, only a single open-file dialog.
- **"Build all."** The spec explicitly calls for both "build this board" and "build
  all" actions, with per-board results reported. Only the per-board flow exists today.
- **Visible button-index assignment.** Each control's logical joystick button gets a
  stable, deterministic index per board at codegen time — this is exactly what the
  user needs to map buttons inside the sim, but it isn't surfaced anywhere in the app
  today.

---

## Related but deferred (from `docs/FUTURE_IDEAS.md`)

Not required for the current rethink, but worth keeping in mind so the UI leaves room
for them rather than needing rework later:

- **A richer board-type catalog:** letting the user visually confirm the physical
  board they're holding (photo) and see a labeled pinout diagram to wire against,
  rather than picking a name from a short list. Note this is genuinely a
  board-*model* concern, not just a microcontroller concern — different physical
  boards sharing a microcontroller can expose, omit, or rename pins differently, and
  the user works from the board's silkscreen, not the chip's datasheet.
- **A bundled toolchain**, which would remove the "toolchain not found" path from the
  Build step entirely.

## Other gaps noticed during this review

Functional gaps (not visual ones) spotted while comparing the spec against the
current app, that aren't yet written down anywhere:

- **No undo/redo** for any edit (control/board/panel changes are all immediate and
  final apart from confirmation prompts on deletes).
- **No reordering UI for panels or boards.** Panels carry an explicit display order in
  the data model, but nothing today lets the user change it after creation; boards
  have no ordering concept at all.
- **No cross-cutting search/filter over controls** beyond grouping by panel — e.g.
  finding all controls on a given board, of a given kind, or currently failing
  validation, when a project has grown large.
