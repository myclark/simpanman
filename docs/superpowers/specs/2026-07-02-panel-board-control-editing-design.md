# Panel/Board/Control Editing UI — Design

Status: approved, not yet implemented
Date: 2026-07-02

## Background

The Controls grid (`src/views/ControlsView.tsx`) and Boards view
(`src/views/BoardsView.tsx`) are read-only today — `ControlsView.tsx` shows
"Grid editing coming soon" in its toolbar, and `BoardsView.tsx` has no way to
add a board. The store (`src/store/index.ts`) and engine
(`electron/engine/commands.ts`) already implement full CRUD
(`upsertPanel`/`deletePanel`/`upsertBoard`/`deleteBoard`/`upsertControl`/`deleteControl`)
end-to-end through real IPC — none of that backend exists to write. This is
almost entirely a UI-layer project, with three small, contained backend
changes described below.

This came out of a broader ask to add Playwright regression tests modeling
real user journeys (load an example project, browse panels, add a control,
assign it a pin; start a new project from scratch; export/build/program
firmware). That request spans three largely independent feature areas:

1. **Panel/board/control editing UI** (this spec) — foundation for the other two.
2. Pin allocation/recommendation UX — layers on top of #1, partially covered here
   (recommendation surfaced at control-creation time) but full "assign pin to an
   existing unassigned control from the Boards tab" flow may be a follow-up.
3. Build & Upload redesign (three-stage: export template / PlatformIO build /
   program with device detection) — independent, not covered by this spec.

This spec covers #1 only.

## Goals

- Full CRUD (create/edit/delete) UI for panels, boards, and controls.
- A control can be created without a board/pin assigned yet ("unassigned"),
  since a user may be sketching out a panel before they've bought or wired
  boards — but when a board (and free pins) already exist, the form should
  recommend and default to a pin immediately.
- Support all five control kinds (button, switch, selector, encoder, analog)
  in the creation/edit form.
- Reuse the existing "expand row in place" interaction (just hardened by the
  renderer-freeze fix in `ControlsView.tsx`) as the mental model for editing a
  control, without touching the actual TanStack Table `expanded`/grouping
  state that fix lives in — edit/add state is separate local component state.

## Non-goals

- Full spreadsheet-style cell-by-cell inline editing with keyboard navigation
  — considered and explicitly deferred; expand-to-form is the v1 pattern.
- Any change to the Build & Upload view or firmware codegen behavior.
- A dedicated "assign pin" flow for existing unassigned controls from the
  Boards tab (may follow later; for now, editing the control itself is how
  you assign/change its board+pin).

## Data model changes

`src/types/index.ts`:

- `Base.boardId` becomes optional: `boardId?: string`.
- Pin fields become optional per kind: `ButtonControl.pin?: PinRef`,
  `SwitchControl.pin?: PinRef`, `EncoderControl.encoder?: EncoderConfig`,
  `AnalogControl.analog?: AnalogConfig`. `SelectorControl.positions` may be `[]`.
- `PinMap.free` (currently `free: string[]`) becomes
  `free: { pin: string; interruptCapable: boolean }[]` so the UI can recommend
  an interrupt-capable pin for encoders without duplicating the engine's pin
  profile knowledge. Computed in `electron/engine/pins.ts` (`computePinMap`),
  which already has access to each board type's `interruptPins` list.
- Existing `.spm` files remain valid — nothing currently required is being
  removed, only new optionality is added. No schema version bump needed.

## Validation changes (`electron/engine/validation.ts`)

- New **warning** kind `ControlUnassigned` (`controlId`): fires when
  `control.boardId == null`. Non-blocking — the boards that ARE fully wired
  can still build.
- `MissingBoardRef` (existing **error**) stays reserved for a `boardId` that
  is set but doesn't match any real board — a genuine data-integrity bug,
  not a deliberate draft state. It should no longer be reachable via the UI
  after the `boardDelete` change below, but stays as a defensive check (e.g.
  hand-edited project files).
- Kind-specific checks (`SelectorNoPins`, `EncoderMissingAxisConfig`, etc.)
  need to tolerate the now-optional fields being entirely absent (control has
  no board/pins yet at all) vs. present-but-invalid (existing behavior) —
  absent should not also fire the more specific error redundantly.

## Behavior change: `boardDelete` (`electron/engine/commands.ts:56`)

Currently cascades to **hard-delete** any control assigned to the deleted
board. Changes to **auto-unassign** instead: clear `boardId` and the
kind-specific pin field(s) on affected controls rather than removing them.
The control survives as "unassigned" and shows the new `ControlUnassigned`
warning. (`panelDelete` keeps its current cascade-delete-controls behavior
unchanged — `panelId` stays mandatory, since a control conceptually always
belongs to some panel even before it has hardware.)

## UI: `ControlsView.tsx`

- Toolbar: add "+ Add Panel" button. Adds a new panel (name prompted inline,
  default "Untitled Panel", immediately editable) via `upsertPanel`.
- Panel-group header row: click the panel name to rename it inline (text
  input replaces the static text, Enter/blur commits via `upsertPanel`,
  Escape cancels); add a delete icon (confirm if it has controls, since
  deleting cascades to deleting those controls, per existing `panelDelete`
  behavior).
- Each expanded panel group gets a trailing "+ Add control to this panel"
  row.
- Each leaf control row gets Edit/Delete icons (new trailing actions column,
  or folded into the existing Notes column area — implementation detail for
  the plan).
- Editing/adding a control is driven by **new local component state**
  (e.g. `editingControlId: string | null`, distinct from the table's
  `expanded` state), which renders an extra `<tr>` directly below the row
  with the full form when set:
  - Panel (pre-filled to the group it's under for "add"; changeable),
    Kind, Label, Board (dropdown, includes "— Unassigned —"), and
    kind-specific fields.
  - When a board is selected, the pin/pins field(s) default to a recommended
    free pin (first `free` entry from `boardPinmap`, preferring
    `interruptCapable: true` for encoder pins) shown in a dropdown of all
    free pins, each annotated with capability/warnings, overridable by the
    user.
  - When no board is selected, pin field(s) are simply not shown/required —
    saving creates an unassigned control.
  - Save calls `upsertControl`; Cancel clears the local state without
    touching the store (nothing is committed until Save).

## UI: `BoardsView.tsx`

- Sidebar header gets "+ Add Board": inserts a new board card in an
  inline-edit state (name text input + type dropdown) at the top of the
  list; confirming calls `upsertBoard` (identity is auto-assigned the same
  way new boards already get one elsewhere in the app — confirm existing
  default-identity behavior when implementing).
- Each `BoardCard` gets a rename affordance (click name → inline input) and a
  delete icon (per the `boardDelete` change above, deleting is now always
  safe — no dangling controls — so no confirmation dialog is strictly needed
  for data-integrity reasons, though a confirmation may still be worth adding
  as a UX safety net for an otherwise-irreversible action; leave as an
  implementation-time call).

## Testing

- **Engine unit tests** (`tests/engine/validation.test.ts`,
  `tests/engine/pins.test.ts`): `ControlUnassigned` warning fires for an
  unassigned control and not for a fully-assigned one; `MissingBoardRef`
  still fires for a genuinely dangling `boardId`; `boardDelete` auto-unassigns
  rather than deleting controls; `computePinMap` free-pin shape includes
  `interruptCapable`.
- **Playwright e2e** (`tests/e2e/`): use real `.click()`, not
  `dispatchEvent("click")` — per the renderer-freeze investigation, synthetic
  events can silently dodge real bugs. New specs cover:
  - New project from scratch: add a panel, add a board, add a control
    assigned to that board/pin, save — mirrors the original user journey.
  - Open an example project (`multi-board-demo.spm`), expand a panel, add a
    new control to it, see the recommended pin pre-filled, save.
  - Add a control with no boards in the project yet (unassigned), confirm the
    non-blocking warning appears and the project still builds for boards that
    do have complete controls.
  - Delete a board that has assigned controls, confirm those controls become
    unassigned (not deleted) and the warning appears.

## Open questions for implementation time

- Exact placement of Edit/Delete icons in the controls grid (new column vs.
  folding into an existing one) — implementation detail, not a design fork.
- Whether deleting a board should still show a confirmation dialog as a UX
  safety net even though it's no longer destructive to control data.
