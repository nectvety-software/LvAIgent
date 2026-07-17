import { type MouseEvent as ReactMouseEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Clipboard, Copy, ExternalLink, MessageSquarePlus, Scissors, Settings, Sparkles } from "lucide-react";
import { copyToClipboard } from "../utils";

interface AppContextMenuProps {
  onNewChat: () => void;
  onOpenSkills: () => void;
  onOpenSettings: () => void;
}

interface MenuState {
  x: number;
  y: number;
  target: HTMLElement;
  selectedText: string;
  link?: string;
}

export default function AppContextMenu({ onNewChat, onOpenSkills, onOpenSettings }: AppContextMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      const target = event.target instanceof HTMLElement ? event.target : document.body;
      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      const selectedText = readSelectedText(target);
      const menuWidth = 220;
      const menuHeight = isEditable(target) ? 300 : 245;
      setMenu({
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
        target,
        selectedText,
        link: anchor?.href,
      });
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

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

  const run = (action: () => unknown | Promise<unknown>) => {
    setMenu(null);
    void action();
  };

  if (!menu) return null;
  const editable = isEditable(menu.target);

  return createPortal(
    <div
      className="fixed z-[290] min-w-[212px] overflow-hidden rounded-xl border border-[#393b50] bg-[#191a27] p-1.5 shadow-[0_18px_55px_rgba(0,0,0,0.5)]"
      style={{ left: menu.x, top: menu.y }}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {(menu.selectedText || editable) && (
        <>
          <ContextItem
            icon={Copy}
            label="Sao chép"
            shortcut="Ctrl+C"
            disabled={!menu.selectedText && !editable}
            onClick={() => run(() => copyToClipboard(menu.selectedText || readEditableValue(menu.target)))}
          />
          {editable && <ContextItem icon={Scissors} label="Cắt" shortcut="Ctrl+X" onClick={() => run(() => executeEditorCommand(menu.target, "cut"))} />}
          {editable && <ContextItem icon={Clipboard} label="Dán" shortcut="Ctrl+V" onClick={() => run(() => pasteInto(menu.target))} />}
          <ContextItem icon={ExternalLink} label="Chọn toàn bộ" shortcut="Ctrl+A" onClick={() => run(() => selectTarget(menu.target))} />
          <div className="my-1 border-t border-[#303247]" />
        </>
      )}
      {menu.link && <ContextItem icon={Copy} label="Sao chép liên kết" onClick={() => run(() => copyToClipboard(menu.link || ""))} />}
      <ContextItem icon={MessageSquarePlus} label="Cuộc trò chuyện mới" shortcut="Ctrl+K" onClick={() => run(onNewChat)} />
      <ContextItem icon={Sparkles} label="Application Skills" onClick={() => run(onOpenSkills)} />
      <ContextItem icon={Settings} label="Cài đặt" onClick={() => run(onOpenSettings)} />
    </div>,
    document.body
  );
}

function isEditable(target: HTMLElement) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
}

function readSelectedText(target: HTMLElement) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? start;
    return target.value.slice(start, end);
  }
  return window.getSelection()?.toString() || "";
}

function readEditableValue(target: HTMLElement) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return target.value;
  return target.textContent || "";
}

function focusTarget(target: HTMLElement) {
  target.focus();
}

function executeEditorCommand(target: HTMLElement, command: "cut") {
  focusTarget(target);
  document.execCommand(command);
}

async function pasteInto(target: HTMLElement) {
  focusTarget(target);
  try {
    const text = await navigator.clipboard.readText();
    document.execCommand("insertText", false, text);
  } catch {
    // Clipboard permission may be unavailable; keyboard paste remains supported.
  }
}

function selectTarget(target: HTMLElement) {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    target.focus();
    target.select();
    return;
  }
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(target.closest("p, pre, article, section, main") || target);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function ContextItem({
  icon: Icon,
  label,
  shortcut,
  disabled,
  onClick,
}: {
  icon: typeof Copy;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] text-[#c9cdda] transition-colors hover:bg-[#292b3d] hover:text-white disabled:pointer-events-none disabled:opacity-35"
    >
      <Icon size={14} className="text-[#858ca4]" />
      <span className="flex-1">{label}</span>
      {shortcut && <span className="font-mono text-[9px] text-[#626980]">{shortcut}</span>}
    </button>
  );
}
