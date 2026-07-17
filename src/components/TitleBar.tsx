import { useEffect, useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

export default function TitleBar() {
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    (async () => {
      setMaximized(await win.isMaximized());

      const unlistenFn = await win.onResized(async () => {
        setMaximized(await win.isMaximized());
      });
      unlisten = unlistenFn;
    })();

    return () => unlisten?.();
  }, [isTauri]);

  const minimize = useCallback(() => isTauri && getCurrentWindow().minimize(), [isTauri]);
  const toggleMax = useCallback(() => {
    if (!isTauri) return;
    const win = getCurrentWindow();
    win.toggleMaximize();
    setMaximized((m) => !m);
  }, [isTauri]);
  const close = useCallback(() => isTauri && getCurrentWindow().close(), [isTauri]);

  return (
    <div
      data-tauri-drag-region
      onDoubleClick={toggleMax}
      className="uaget-titlebar titlebar-drag h-[49px] min-h-[49px] flex items-center justify-between border-b select-none"
    >
      {/* Left: logo + title + sidebar toggle */}
      <div className="uaget-titlebar-brand flex items-center px-[30px]">
        <span className="text-[24px] leading-none font-bold tracking-[-0.5px] text-white">
          LvAIgent
        </span>
      </div>

      {/* Right: native window controls */}
      <div className="uaget-titlebar-actions flex items-center justify-end h-full gap-1 pr-1">
        <button
          onClick={minimize}
          className="w-11 h-full flex items-center justify-center text-[#9aa4b2] hover:bg-[#1a1f2b] hover:text-[#e6e9ef] transition-colors"
          title="Thu nhỏ"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={toggleMax}
          className="w-11 h-full flex items-center justify-center text-[#9aa4b2] hover:bg-[#1a1f2b] hover:text-[#e6e9ef] transition-colors"
          title={maximized ? "Khôi phục" : "Phóng to"}
        >
          {maximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="3" y="1.5" width="7.5" height="7.5" rx="1" />
              <rect x="1.5" y="3" width="7.5" height="7.5" rx="1" fill="#0b0d12" />
            </svg>
          ) : (
            <Square size={12} />
          )}
        </button>
        <button
          onClick={close}
          className="w-11 h-full flex items-center justify-center text-[#9aa4b2] hover:bg-red-500 hover:text-white transition-colors"
          title="Đóng"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
