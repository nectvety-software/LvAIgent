import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, FilePenLine, FileText, MessageSquareText, MousePointer2 } from "lucide-react";
import { copyToClipboard } from "../utils";

interface CodeContextMenuProps {
  children: ReactNode;
  text: string;
  filePath?: string;
  className?: string;
  onEdit?: () => void;
  onSendToChat?: () => void;
}

interface MenuPosition {
  x: number;
  y: number;
}

export default function CodeContextMenu({
  children,
  text,
  filePath,
  className,
  onEdit,
  onSendToChat,
}: CodeContextMenuProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuPosition | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  const openMenu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 210;
    const menuHeight = filePath || onEdit || onSendToChat ? 220 : 132;
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
    });
  };

  const run = (action: () => unknown | Promise<unknown>) => {
    setMenu(null);
    void action();
  };

  const copySelection = () => {
    const active = document.activeElement;
    if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
      const start = active.selectionStart ?? 0;
      const end = active.selectionEnd ?? start;
      const selected = active.value.slice(start, end);
      return copyToClipboard(selected || text);
    }
    return copyToClipboard(window.getSelection()?.toString() || text);
  };

  const selectAll = () => {
    const input = wrapperRef.current?.querySelector("textarea, input");
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      input.focus();
      input.select();
      return;
    }
    if (!wrapperRef.current) return;
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(wrapperRef.current);
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  return (
    <div ref={wrapperRef} className={className} onContextMenu={openMenu}>
      {children}
      {menu && createPortal(
        <div
          className="fixed z-[300] min-w-[200px] overflow-hidden rounded-xl border border-[#393b50] bg-[#191a27] p-1.5 shadow-[0_18px_55px_rgba(0,0,0,0.48)]"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <MenuItem icon={Copy} label="Sao chép phần đã chọn" shortcut="Ctrl+C" onClick={() => run(copySelection)} />
          <MenuItem icon={FileText} label="Sao chép toàn bộ" onClick={() => run(() => copyToClipboard(text))} />
          <MenuItem icon={MousePointer2} label="Chọn toàn bộ" shortcut="Ctrl+A" onClick={() => run(selectAll)} />
          {(filePath || onEdit || onSendToChat) && <div className="my-1 border-t border-[#303247]" />}
          {filePath && <MenuItem icon={Copy} label="Sao chép đường dẫn" onClick={() => run(() => copyToClipboard(filePath))} />}
          {onSendToChat && <MenuItem icon={MessageSquareText} label="Gửi code đến chat" onClick={() => run(onSendToChat)} />}
          {onEdit && <MenuItem icon={FilePenLine} label="Chỉnh sửa tệp" onClick={() => run(onEdit)} />}
        </div>,
        document.body
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  shortcut,
  onClick,
}: {
  icon: typeof Copy;
  label: string;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] text-[#c9cdda] transition-colors hover:bg-[#292b3d] hover:text-white"
    >
      <Icon size={14} className="text-[#858ca4]" />
      <span className="flex-1">{label}</span>
      {shortcut && <span className="font-mono text-[9px] text-[#626980]">{shortcut}</span>}
    </button>
  );
}
