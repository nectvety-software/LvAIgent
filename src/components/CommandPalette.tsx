import { useEffect, useRef, useState } from "react";
import {
  Plus,
  FolderOpen,
  Settings,
  Rocket,
  PanelLeft,
  PanelRight,
  Cpu,
  MessageSquare,
  Search,
  CornerDownLeft,
} from "lucide-react";
import { useStore } from "../store";

interface Props {
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onCheckUpdate: () => void;
  onToggleSidebar: () => void;
  onToggleRightPanel: () => void;
}

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ElementType;
  run: () => void;
  group: string;
}

export default function CommandPalette({
  open,
  onClose,
  onNewChat,
  onOpenSettings,
  onCheckUpdate,
  onToggleSidebar,
  onToggleRightPanel,
}: Props) {
  const { models, settings, updateSettings, workspaces, openProject } = useStore();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setQuery("");
    setActive(0);
    onClose();
  };

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const allCommands: Command[] = [
    {
      id: "new",
      label: "Cuộc trò chuyện mới",
      hint: "Ctrl K",
      icon: Plus,
      group: "Chat",
      run: () => {
        onNewChat();
        close();
      },
    },
    {
      id: "settings",
      label: "Mở cài đặt",
      icon: Settings,
      group: "Chat",
      run: () => {
        onOpenSettings();
        close();
      },
    },
    {
      id: "update",
      label: "Kiểm tra cập nhật",
      icon: Rocket,
      group: "Chat",
      run: () => {
        onCheckUpdate();
        close();
      },
    },
    {
      id: "toggle-sidebar",
      label: "Ẩn/hiện sidebar",
      icon: PanelLeft,
      group: "Giao diện",
      run: () => {
        onToggleSidebar();
        close();
      },
    },
    {
      id: "toggle-right",
      label: "Ẩn/hiện panel dự án",
      icon: PanelRight,
      group: "Giao diện",
      run: () => {
        onToggleRightPanel();
        close();
      },
    },
    ...workspaces.map<Command>((ws) => ({
      id: `ws-${ws.path}`,
      label: `Mở workspace: ${ws.name}`,
      icon: FolderOpen,
      group: "Workspaces",
      run: () => {
        openProject(ws.path);
        close();
      },
    })),
    ...models.map<Command>((m) => ({
      id: `model-${m.model_id}`,
      label: `Chọn model: ${m.display_name || m.model_id}`,
      icon: Cpu,
      group: "Model",
      run: () => {
        updateSettings({ selectedModel: m.model_id });
        close();
      },
    })),
  ];

  const filtered = allCommands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  const groups = filtered.reduce<Record<string, Command[]>>((acc, c) => {
    (acc[c.group] ||= []).push(c);
    return acc;
  }, {});

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [active]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[active]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  let flatIdx = -1;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[12vh]"
      onClick={close}
    >
      <div
        className="w-[560px] max-w-[92vw] bg-[#101319] border border-[#2f3848] rounded-2xl shadow-panel overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#232a36]">
          <Search size={16} className="text-[#5f6b7a] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Gõ lệnh hoặc tìm kiếm..."
            className="flex-1 bg-transparent text-sm text-[#e6e9ef] placeholder-[#5f6b7a] outline-none"
          />
          <kbd className="text-[10px] text-[#5f6b7a] border border-[#2f3848] rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2 modal-scroll">
          {filtered.length === 0 ? (
            <p className="text-center text-xs text-[#5f6b7a] py-8">
              Không tìm thấy lệnh
            </p>
          ) : (
            Object.entries(groups).map(([group, cmds]) => (
              <div key={group} className="mb-1">
                <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#5f6b7a]">
                  {group}
                </p>
                {cmds.map((c) => {
                  flatIdx++;
                  const idx = flatIdx;
                  const isActive = idx === active;
                  return (
                    <button
                      key={c.id}
                      data-idx={idx}
                      onClick={c.run}
                      onMouseEnter={() => setActive(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                        isActive
                          ? "bg-mimoorange-soft text-[#e6e9ef]"
                          : "text-[#9aa4b2] hover:bg-[#1a1f2b]"
                      }`}
                    >
                      <c.icon
                        size={15}
                        className={isActive ? "text-mimoorange" : "text-[#5f6b7a]"}
                      />
                      <span className="flex-1 truncate">{c.label}</span>
                      {c.hint && (
                        <span className="text-[10px] text-[#5f6b7a]">{c.hint}</span>
                      )}
                      {isActive && (
                        <CornerDownLeft size={12} className="text-[#5f6b7a]" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
