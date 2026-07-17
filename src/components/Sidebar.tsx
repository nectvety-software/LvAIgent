import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  History,
  Pin,
  Brain,
  MoreVertical,
  Trash2,
  Edit3,
  MessageSquare,
  FolderOpen,
  FolderClosed,
  X,
  Layout,
  PanelLeftClose,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";
import type { ChatInfo } from "../types";
import type { ActivityView } from "./ActivityBar";

interface Props {
  open?: boolean;
  activeView?: ActivityView;
  onClose?: () => void;
}

export default function Sidebar({ open = true, activeView = "chat", onClose }: Props) {
  const {
    chats,
    startNewChat,
    loadChatList,
    isGenerating,
    currentProject,
    openProject,
    closeProject,
    workspaces,
    addWorkspace,
    removeWorkspace,
    setChatInput,
  } = useStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [explorerTab, setExplorerTab] = useState<"workspaces" | "history">("workspaces");

  useEffect(() => {
    loadChatList();
  }, []);

  const pickFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Chọn thư mục dự án",
      });
      if (selected) {
        const folderPath = Array.isArray(selected) ? selected[0] : selected;
        await openProject(folderPath);
      }
    } catch (e) {
      console.error("Open project error:", e);
    }
  };

  return (
    <aside
      data-open={open}
      className={`uaget-sidebar ${open ? "w-[382px] min-w-[382px]" : "w-0 min-w-0"} flex flex-col select-none transition-all duration-200 overflow-hidden`}
    >
      <div className="uaget-sidebar-toolbar h-[55px] min-h-[55px] flex items-center justify-end px-3 border-b border-[#202037]">
        <button
          onClick={onClose}
          className="uaget-sidebar-toggle w-10 h-10 flex items-center justify-center text-[#777d96] hover:text-[#d8dbe7] hover:bg-[#1c1c34] rounded-lg transition-colors"
          title="Thu gọn sidebar"
        >
          <PanelLeftClose size={20} />
        </button>
      </div>
      {/* New chat */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={startNewChat}
          disabled={isGenerating}
          className="uaget-new-chat w-full flex items-center gap-2 px-3 h-9 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          <Plus size={16} className="text-mimoorange" />
          <span className="font-medium">Cuộc trò chuyện mới</span>
          <span className="ml-auto text-[10px] text-[#5f6b7a] bg-[#0b0d12] border border-[#2f3848] px-1.5 py-0.5 rounded">
            Ctrl K
          </span>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto sidebar-scroll px-3 pb-3 space-y-4">
        {activeView === "chat" && (
          <>
            {/* AI Analysis prompt templates */}
            <section>
              <div className="flex items-center gap-1.5 px-1 mb-1.5 text-[11px] font-semibold text-[#9aa4b2] uppercase tracking-wider">
                <Brain size={12} className="text-mimoorange" />
                <span>Trò chuyện phân tích</span>
              </div>
              <div className="space-y-1.5">
                {[
                  { icon: "📝", label: "Mô tả & Tóm tắt", prompt: "Hãy mô tả và tóm tắt nội dung chính của tài liệu này một cách ngắn gọn, rõ ràng." },
                  { icon: "🔍", label: "Phân tích & Nghiên cứu", prompt: "Hãy phân tích sâu và nghiên cứu chủ đề này, chỉ ra các điểm mạnh, điểm yếu và insights quan trọng." },
                  { icon: "💡", label: "Gợi ý Prompt", prompt: "Gợi ý cho tôi 5 prompt hiệu quả để khai thác tối đa khả năng của AI cho công việc này." },
                  { icon: "🌐", label: "Dịch & Giải thích", prompt: "Dịch nội dung sau sang tiếng Việt và giải thích ý nghĩa của từng phần một cách dễ hiểu." },
                ].map((t, i) => (
                  <button
                    key={i}
                    onClick={() => setChatInput(t.prompt)}
                    className="w-full flex items-start gap-2 px-2.5 py-2 text-left text-xs text-[#9aa4b2] hover:text-[#e6e9ef] hover:bg-[#1a1f2b] rounded-lg border border-[#2f3848] transition-colors"
                  >
                    <span className="text-sm shrink-0">{t.icon}</span>
                    <span className="font-medium">{t.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[#5f6b7a] px-1 mt-2 leading-relaxed">
                AI Agent nghiên cứu & phân tích — không có tính năng code trong trò chuyện này.
              </p>
            </section>

            {/* Chat history */}
            <section>
              <div className="flex items-center gap-1.5 px-1 mb-1.5 text-[11px] font-semibold text-[#9aa4b2] uppercase tracking-wider">
                <History size={12} />
                <span>Nhật ký trò chuyện</span>
              </div>
              <div className="space-y-0.5">
                {chats.length === 0 ? (
                  <p className="text-xs text-[#5f6b7a] px-2 py-3 text-center">
                    Chưa có cuộc trò chuyện nào
                  </p>
                ) : (
                  <>
                    {[...chats]
                      .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0))
                      .map((chat) => (
                        <ChatRow key={chat.cid} chat={chat} />
                      ))}
                  </>
                )}
              </div>
            </section>
          </>
        )}

        {activeView === "explorer" && (
          <section>
            {/* Tabs */}
            <div className="flex items-center gap-1 px-1 mb-2">
              <button
                onClick={() => setExplorerTab("workspaces")}
                className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  explorerTab === "workspaces"
                    ? "bg-mimoorange-soft text-mimoorange"
                    : "text-[#5f6b7a] hover:text-[#9aa4b2] hover:bg-[#1a1f2b]"
                }`}
              >
                Workspaces
              </button>
              <button
                onClick={() => setExplorerTab("history")}
                className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  explorerTab === "history"
                    ? "bg-mimoorange-soft text-mimoorange"
                    : "text-[#5f6b7a] hover:text-[#9aa4b2] hover:bg-[#1a1f2b]"
                }`}
              >
                Nhật ký
              </button>
            </div>

            {explorerTab === "workspaces" && (
              <>
                <div className="flex items-center justify-between px-1 mb-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#9aa4b2] uppercase tracking-wider">
                    <Layout size={12} className="text-mimoorange" />
                    <span>Workspaces</span>
                  </div>
                  <button
                    onClick={pickFolder}
                    className="p-0.5 text-[#5f6b7a] hover:text-mimoorange hover:bg-[#1a1f2b] rounded transition-colors"
                    title="Thêm workspace"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <div className="space-y-0.5">
                  {workspaces.length === 0 ? (
                    <button
                      onClick={pickFolder}
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-[#9aa4b2] hover:text-[#e6e9ef] hover:bg-[#1a1f2b] rounded-lg transition-colors border border-dashed border-[#2f3848]"
                    >
                      <FolderOpen size={13} className="text-mimoorange" />
                      <span>Import thư mục dự án</span>
                    </button>
                  ) : (
                    workspaces.map((ws) => {
                      const isActive = currentProject?.path === ws.path;
                      return (
                        <div key={ws.path}>
                          <div
                            onClick={() => openProject(ws.path)}
                            className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-xs transition-colors ${
                              isActive
                                ? "bg-mimoorange-soft text-mimoorange"
                                : "text-[#9aa4b2] hover:bg-[#1a1f2b] hover:text-[#e6e9ef]"
                            }`}
                          >
                            {isActive ? <FolderOpen size={13} className="shrink-0 text-mimoorange" /> : <FolderClosed size={13} className="shrink-0 text-mimoorange" />}
                            <span className="truncate flex-1 font-medium">{ws.name}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isActive) closeProject();
                                removeWorkspace(ws.path);
                              }}
                              className="p-0.5 text-[#5f6b7a] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Xóa workspace"
                            >
                              <X size={11} />
                            </button>
                          </div>
                          {/* Project path + sessions (no file tree) */}
                          {isActive && (
                            <div className="ml-3 mt-1 mb-2 border-l border-[#232a36] pl-2 space-y-1">
                              {/* Path location */}
                              <div className="flex items-center gap-1 px-1 py-0.5 text-[10px] text-[#5f6b7a]">
                                <FolderClosed size={10} className="text-mimoorange shrink-0" />
                                <span className="truncate">{ws.path}</span>
                              </div>
                              {/* Sessions of this project */}
                              {(() => {
                                const projectChats = chats.filter((c) => c.project_path === ws.path);
                                return (
                                  <div className="space-y-0.5">
                                    <p className="text-[10px] text-[#5f6b7a] px-1 uppercase tracking-wider">
                                      Nhật ký ({projectChats.length})
                                    </p>
                                    {projectChats.length === 0 ? (
                                      <p className="text-[10px] text-[#5f6b7a] px-1 py-1">
                                        Chưa có phiên trò chuyện
                                      </p>
                                    ) : (
                                      projectChats
                                        .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0))
                                        .map((chat) => (
                                          <ChatRow key={chat.cid} chat={chat} compact />
                                        ))
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {explorerTab === "history" && (
              <>
                <div className="flex items-center gap-1.5 px-1 mb-1.5 text-[11px] font-semibold text-[#9aa4b2] uppercase tracking-wider">
                  <History size={12} className="text-mimoorange" />
                  <span>Nhật ký trò chuyện</span>
                </div>
                {!currentProject ? (
                  <p className="text-xs text-[#5f6b7a] px-2 py-3 text-center">
                    Chưa có dự án nào được mở
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {(() => {
                      const projectChats = chats.filter((c) => c.project_path === currentProject.path);
                      return projectChats.length === 0 ? (
                        <p className="text-xs text-[#5f6b7a] px-2 py-3 text-center">
                          Chưa có phiên trò chuyện cho dự án này
                        </p>
                      ) : (
                        [...projectChats]
                          .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0))
                          .map((chat) => (
                            <ChatRow key={chat.cid} chat={chat} />
                          ))
                      );
                    })()}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {activeView === "search" && (
          <section>
            <div className="flex items-center gap-1.5 px-1 mb-1.5 text-[11px] font-semibold text-[#9aa4b2] uppercase tracking-wider">
              <FolderClosed size={12} className="text-mimoorange" />
              <span>Tìm kiếm</span>
            </div>
            <div className="px-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm nội dung trò chuyện..."
                className="w-full bg-[#1a1f2b] border border-[#2f3848] rounded-lg px-3 py-2 text-xs text-[#e6e9ef] placeholder-[#5f6b7a] outline-none focus:border-mimoorange transition-colors"
              />
              <div className="mt-2 space-y-0.5">
                {chats
                  .filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((chat) => (
                    <ChatRow key={chat.cid} chat={chat} compact />
                  ))}
                {searchQuery && chats.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                  <p className="text-[10px] text-[#5f6b7a] mt-2 text-center">
                    Không tìm thấy kết quả
                  </p>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

function ChatRow({ chat, compact = false }: { chat: ChatInfo; compact?: boolean }) {
  const {
    currentChatCid,
    loadChat,
    deleteChat,
    togglePinChat,
    renameChat,
    isGenerating,
  } = useStore();
  const isActive = currentChatCid === chat.cid;
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(chat.title);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const closeMenu = () => setMenuPosition(null);
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node)
        && triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setMenuPosition(null);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    if (menuPosition) {
      document.addEventListener("mousedown", handleClick);
      window.addEventListener("keydown", handleKey);
      window.addEventListener("resize", closeMenu);
      window.addEventListener("scroll", closeMenu, true);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [menuPosition]);

  const load = () => {
    if (isGenerating) return;
    loadChat(chat.cid);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuPosition(null);
    deleteChat(chat.cid);
  };

  const handlePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuPosition(null);
    togglePinChat(chat.cid);
  };

  const handleRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuPosition(null);
    setNewTitle(chat.title);
    setRenaming(true);
  };

  const submitRename = () => {
    const trimmed = newTitle.trim();
    if (trimmed && trimmed !== chat.title) {
      renameChat(chat.cid, trimmed);
    }
    setRenaming(false);
  };

  const formatTime = (ts: number) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMins < 1) return "Vừa xong";
    if (diffMins < 60) return `${diffMins}p`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}g`;
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  };

  const openContextMenu = (event: React.MouseEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    event.stopPropagation();
    setMenuPosition({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 152)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 122)),
    });
  };

  const toggleMoreMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (menuPosition) {
      setMenuPosition(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPosition({
      x: Math.max(8, Math.min(rect.right - 144, window.innerWidth - 152)),
      y: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 122)),
    });
  };

  return (
    <div
      onClick={load}
      onContextMenu={openContextMenu}
      className={`group flex items-center rounded-lg cursor-pointer transition-colors ${compact ? "gap-1.5 px-1.5 py-1 text-[11px]" : "gap-2 px-2.5 py-2 text-xs"} ${
        isActive
          ? "bg-[#1f2733] text-[#e6e9ef]"
          : "text-[#9aa4b2] hover:bg-[#1a1f2b] hover:text-[#e6e9ef]"
      } ${isGenerating && !isActive ? "opacity-50" : ""}`}
    >
      <MessageSquare size={compact ? 10 : 13} className="text-[#5f6b7a] shrink-0" />
      {chat.is_pinned && <Pin size={10} className="text-mimoorange shrink-0" />}
      {renaming ? (
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onBlur={submitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitRename();
            if (e.key === "Escape") setRenaming(false);
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          autoFocus
          className="flex-1 bg-[#0b0d12] border border-mimoorange rounded px-1.5 py-0.5 text-xs outline-none"
        />
      ) : (
        <>
          <span className="truncate flex-1">{chat.title}</span>
          {!compact && <span className="text-[9px] text-[#5f6b7a] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{formatTime(chat.timestamp)}</span>}
        </>
      )}
      <div className="relative shrink-0">
        <button
          ref={triggerRef}
          onClick={toggleMoreMenu}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-[#5f6b7a] hover:text-[#e6e9ef] rounded"
          title="Tùy chọn cuộc trò chuyện"
        >
          <MoreVertical size={12} />
        </button>
      </div>
      {menuPosition && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[310] w-36 overflow-hidden rounded-xl border border-[#36394b] bg-[#1a1b28] py-1 shadow-[0_16px_45px_rgba(0,0,0,0.48)] animate-scale-in"
          style={{ left: menuPosition.x, top: menuPosition.y }}
          onContextMenu={(event) => event.preventDefault()}
          onClick={(event) => event.stopPropagation()}
        >
          <MenuBtn icon={Edit3} label="Đổi tên" onClick={handleRename} />
          <MenuBtn icon={Pin} label={chat.is_pinned ? "Bỏ ghim" : "Ghim"} onClick={handlePin} />
          <MenuBtn icon={Trash2} label="Xóa" onClick={handleDelete} danger />
        </div>,
        document.body
      )}
    </div>
  );
}

function MenuBtn({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ElementType;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
        danger
          ? "text-red-400 hover:bg-red-500/10"
          : "text-[#9aa4b2] hover:bg-[#20262f] hover:text-[#e6e9ef]"
      }`}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}
