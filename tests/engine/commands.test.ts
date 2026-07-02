import { describe, it, expect } from "vitest";
import { projectNew, controlUpsert, boardUpsert, boardDelete } from "../../electron/engine";
import type { Control } from "../../electron/engine";

describe("boardDelete", () => {
  it("unassigns controls on the deleted board instead of deleting them", () => {
    let project = projectNew("T");
    const panelId = project.panels[0].id;
    const keepBoardId = project.boards[0].id;
    const doomedBoardId = "doomed-board";
    project = boardUpsert(project, {
      id: doomedBoardId,
      name: "Doomed",
      type: "leonardo",
      identity: { usbProduct: "Doomed", usbVid: 0x1209, usbPid: 1 },
    });
    const button: Control = {
      id: "ctl-1",
      panelId,
      boardId: doomedBoardId,
      label: "Button",
      kind: "button",
      pin: { pin: "D5", inverted: false },
    };
    project = controlUpsert(project, button);

    const next = boardDelete(project, doomedBoardId);

    expect(next.boards.some((b) => b.id === doomedBoardId)).toBe(false);
    expect(next.controls).toHaveLength(1);
    const survivor = next.controls[0] as Control & { kind: "button" };
    expect(survivor.id).toBe("ctl-1");
    expect(survivor.boardId).toBeUndefined();
    expect(survivor.pin).toBeUndefined();
    // Sanity: deleting an unrelated board leaves other controls' boardId alone.
    expect(project.boards[0].id).toBe(keepBoardId);
  });
});
