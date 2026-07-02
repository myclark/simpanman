import type { PinRef, SelectorOp, SelectorPosition } from "@/types";

interface Props {
  positions: SelectorPosition[];
  onChange: (positions: SelectorPosition[]) => void;
}

export default function SelectorPositionsEditor({ positions, onChange }: Props) {
  const updatePosition = (index: number, next: SelectorPosition) => {
    onChange(positions.map((p, i) => (i === index ? next : p)));
  };

  const addPosition = () => {
    onChange([...positions, { label: `Position ${positions.length + 1}`, pins: [], op: null }]);
  };

  const removePosition = (index: number) => {
    onChange(positions.filter((_, i) => i !== index));
  };

  const addPin = (index: number) => {
    const pos = positions[index];
    updatePosition(index, { ...pos, pins: [...pos.pins, { pin: "D0", inverted: false }] });
  };

  const updatePin = (posIndex: number, pinIndex: number, next: PinRef) => {
    const pos = positions[posIndex];
    updatePosition(posIndex, {
      ...pos,
      pins: pos.pins.map((p, i) => (i === pinIndex ? next : p)),
    });
  };

  const removePin = (posIndex: number, pinIndex: number) => {
    const pos = positions[posIndex];
    updatePosition(posIndex, { ...pos, pins: pos.pins.filter((_, i) => i !== pinIndex) });
  };

  return (
    <div className="space-y-2">
      {positions.map((pos, posIndex) => (
        <div key={posIndex} className="border border-[#30363d] rounded p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              value={pos.label}
              onChange={(e) => updatePosition(posIndex, { ...pos, label: e.target.value })}
              placeholder="Position label"
              className="flex-1 text-xs bg-[#0d1117] border border-[#30363d] rounded px-2 py-1"
            />
            <button
              type="button"
              onClick={() => removePosition(posIndex)}
              className="text-xs text-[#f85149] px-1.5"
              aria-label={`Remove position ${pos.label}`}
            >
              ✕
            </button>
          </div>
          {pos.pins.map((pinRef, pinIndex) => (
            <div key={pinIndex} className="flex items-center gap-2 pl-2">
              <input
                value={pinRef.pin}
                onChange={(e) => updatePin(posIndex, pinIndex, { ...pinRef, pin: e.target.value })}
                placeholder="Pin (e.g. D5)"
                className="w-20 text-xs font-mono bg-[#0d1117] border border-[#30363d] rounded px-2 py-1"
              />
              <label className="text-xs text-[#8b949e] flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={pinRef.inverted}
                  onChange={(e) => updatePin(posIndex, pinIndex, { ...pinRef, inverted: e.target.checked })}
                />
                inverted
              </label>
              <button
                type="button"
                onClick={() => removePin(posIndex, pinIndex)}
                className="text-xs text-[#f85149]"
                aria-label="Remove pin"
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={() => addPin(posIndex)} className="text-xs text-[#58a6ff] pl-2">
            + Add pin
          </button>
          {pos.pins.length > 1 && (
            <label className="text-xs text-[#8b949e] flex items-center gap-2 pl-2">
              Combine with:
              <select
                value={pos.op ?? ""}
                onChange={(e) =>
                  updatePosition(posIndex, { ...pos, op: (e.target.value || null) as SelectorOp | null })
                }
                className="text-xs bg-[#0d1117] border border-[#30363d] rounded px-1 py-0.5"
              >
                <option value="">— choose —</option>
                <option value="and">AND</option>
                <option value="or">OR</option>
              </select>
            </label>
          )}
        </div>
      ))}
      <button type="button" onClick={addPosition} className="text-xs text-[#58a6ff]">
        + Add position
      </button>
    </div>
  );
}
