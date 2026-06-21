// Phase 3 stub — HID live test view
export default function TestView() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-[#8b949e]">
      <div className="text-4xl">🔌</div>
      <p className="text-lg font-semibold text-[#e6edf3]">Test View</p>
      <p className="text-sm max-w-md text-center">
        After uploading firmware to a board, connect it and the board will appear
        here as a HID joystick. You will be able to verify each control fires the
        correct button or axis.
      </p>
      <p className="text-xs text-[#484f58]">Available in Phase 3</p>
    </div>
  );
}
