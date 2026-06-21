# Example projects

Sample `.spm` project files (JSON, `schemaVersion: 1`) for the Sim Panel Manager.
See `../TECHNICAL_SPEC.md` §4 for the full schema. These double as **codegen test fixtures**.

> IDs in these files are human-readable (e.g. `board-arm`) for legibility. The real app
> assigns UUIDs. `usbVid` `4617` is `0x1209` (the pid.codes open-source VID); the PIDs
> `1`–`3` are the prototyping/test range.

## `f5e-armament.spm`
Faithful conversion of **`Arduino 1 code.pdf`** — one Leonardo, one panel, 18 logical
controls expanding to 34 joystick buttons. Coverage:

- **buttons** (momentary), incl. two wired active-high (`inverted: false`) on `D0`/`D1`
  to show the field matters (and that the app should *warn* about using the Serial pins);
- **switches** (2-position → two buttons each), incl. custom labels (Bomb Arm: Safe / Nose-Tail)
  and one wired the opposite sense (Landing Light);
- **selectors** (3-position), incl. AND-combined pin expressions for the middle position
  (e.g. Jettison "Off" = `D10 AND D11`).

Uses all 20 usable pins (`D0`–`D13`, `A0`–`A5`) on a single board, no conflicts.

## `multi-board-demo.spm`
The primary fixture. Exercises **every control kind** and the headline **many-to-many**
relationship (panels split across boards; boards carrying several panels). Names are drawn
from the real F-5E panels; the analog and axis-mode encoder controls are illustrative
additions to cover the schema.

| Panel | Controls | Board(s) |
|---|---|---|
| Armament | Master Arm (switch), Jettison Select (3-pos selector) | A |
| Armament | Emergency All Jettison (button) | **B** (panel spills onto another board) |
| Sight | Missile Mode (5-pos selector) | B |
| Sight | Sight Brightness (encoder, **buttons** mode, 10 presses/detent) | B |
| Sight | Sight Depression (encoder, **axis** mode, delta/step) | B |
| Systems | Pitot Anti-Ice, Engine Anti-Ice (switches), Cabin Pressure (analog) | C |
| Systems | Rudder Trim (analog) | **B** (panel spills onto another board) |

Notes for the implementer:
- The two encoders sit on analog pins (`A0`–`A3`), which are **not** interrupt-capable —
  the app should warn and fall back to polling (as the original `Arduino 2` firmware does).
- Per-board pin maps: A=3, B=11, C=3 pins used; no double-bookings.

## Validating a fixture
Referential integrity + pin-conflict + identity-uniqueness checks should be part of the
app's `validate()` command (TECHNICAL_SPEC §12). A quick manual sanity check:

```bash
python3 - <<'PY'
import json
for f in ["f5e-armament.spm","multi-board-demo.spm"]:
    d=json.load(open(f)); print(f, len(d["panels"]),"panels",len(d["boards"]),"boards",len(d["controls"]),"controls")
PY
```
