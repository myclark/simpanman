import type { PinMap } from "@/types";

/**
 * Pick a pin to default a new/edited control to: prefers an interrupt-capable
 * free pin when requested (encoders), otherwise the first free pin in
 * PinMap.free order. Returns null when there's no board selected yet (no
 * PinMap) or no free pins left.
 */
export function recommendPin(
  pinMap: PinMap | undefined,
  opts: { interruptCapable?: boolean } = {},
): string | null {
  if (!pinMap || pinMap.free.length === 0) return null;
  if (opts.interruptCapable) {
    const interrupt = pinMap.free.find((p) => p.interruptCapable);
    if (interrupt) return interrupt.pin;
  }
  return pinMap.free[0].pin;
}
