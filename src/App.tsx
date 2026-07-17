import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useStore } from "./store";
import ActivityBar from "./components/ActivityBar";
import type { ActivityView } from "./components/ActivityBar";
import Sidebar from "./components/Sidebar";
import ChatView from "./components/ChatView";
import SettingsDialog from "./components/SettingsDialog";
import PiPPlayer from "./components/PiPPlayer";
import Toast from "./components/Toast";
import RightPanel from "./components/RightPanel";
import TitleBar from "./components/TitleBar";
import CommandPalette from "./components/CommandPalette";
import UpdateDialog, { checkForUpdates } from "./components/UpdateDialog";
import type { MimoEvent } from "./types";
import SkillsDialog from "./components/SkillsDialog";
import AppContextMenu from "./components/AppContextMenu";

function App() {
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const {
    status,
    setStatus,
    appendToLast,
    appendToLastThoughts,
    addTaskToLast,
    setGenerating,
    startNewChat,
    loadMimoModels,
    loadChatList,
    saveCurrentChat,
    addTaskLog,
    ensureSessionWorkspace,
    refreshProjectChanges,
  } = useStore();

  const [bridgeError, setBridgeError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [activeView, setActiveView] = useState<ActivityView>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [showUpdate, setShowUpdate] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showSkills, setShowSkills] = useState(false);

  // Listen to mimo events
  useEffect(() => {
    if (!isTauri) return;
    const unlisten = listen<MimoEvent>("mimo-event", (event) => {
      const data = event.payload;
      switch (data.type) {
        case "step_start":
          addTaskLog("running", "Đang xử lý...");
          break;
        case "delta":
          if (data.text) appendToLast(data.text);
          break;
        case "reasoning":
          if (data.text) appendToLastThoughts(data.text);
          break;
        case "done":
          addTaskLog("success", "Hoàn thành");
          setGenerating(false);
          void refreshProjectChanges();
          setTimeout(() => {
            saveCurrentChat();
            const state = useStore.getState();
            if (!state.currentProject && state.messages.length > 0) {
              const lastAssistant = [...state.messages].reverse().find(m => m.role === "assistant");
              if (lastAssistant?.content) {
                ensureSessionWorkspace(lastAssistant.content);
              }
            }
          }, 300);
          break;
        case "error":
          console.error("Mimo error:", data.message);
          appendToLast(`\n\n[Lỗi: ${data.message}]`);
          addTaskLog("error", `Lỗi: ${data.message}`);
          setGenerating(false);
          void refreshProjectChanges();
          setTimeout(() => void saveCurrentChat(), 200);
          break;
        case "task_info":
          if (data.name) {
            addTaskLog("info", data.name);
            const status = (data.status as "running" | "success" | "error") || "running";
            addTaskToLast(data.name, status, data.detail);
            setTimeout(() => void saveCurrentChat(), 250);
          }
          break;
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [appendToLast, appendToLastThoughts, addTaskToLast, setGenerating, saveCurrentChat, addTaskLog, refreshProjectChanges, isTauri]);

  // Connect to mimo on startup
  useEffect(() => {
    if (!isTauri) return;
    if (status === "disconnected") {
      (async () => {
        try {
          setStatus("connecting");
          await invoke("start_mimo");
          setStatus("connected");
          await loadMimoModels();
          await loadChatList();
        } catch (e) {
          const msg = String(e);
          console.error(e);
          setStatus("error");
          setBridgeError(msg);
        }
      })();
    }
  }, [status, setStatus, loadMimoModels, loadChatList, isTauri]);

  // Auto-check for updates on startup (once per day)
  useEffect(() => {
    const today = new Date().toDateString();
    const lastCheck = localStorage.getItem("mimo_update_check");
    if (lastCheck !== today) {
      checkForUpdates().then((release) => {
        localStorage.setItem("mimo_update_check", today);
        if (release) setShowUpdate(true);
      });
    }
  }, []);

  // Load workspaces from disk
  useEffect(() => {
    (async () => {
      const { loadWorkspaces } = useStore.getState();
      await loadWorkspaces();
    })();
  }, []);

  // Ctrl+K opens command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Release builds do not expose browser inspection shortcuts. Browser-based
  // development remains unaffected; the packaged WebView disables its inspector.
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const blockInspectionShortcuts = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const blocked = event.key === "F12"
        || ((event.ctrlKey || event.metaKey) && event.shiftKey && ["i", "j", "c"].includes(key))
        || ((event.ctrlKey || event.metaKey) && key === "u");
      if (blocked) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", blockInspectionShortcuts, true);
    return () => window.removeEventListener("keydown", blockInspectionShortcuts, true);
  }, []);

  return (
    <div className="uaget-app h-screen w-screen flex flex-col text-[#e6e9ef] overflow-hidden relative">
      <TitleBar />
      {bridgeError && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-red-950/90 border-b border-red-800 px-4 py-2 text-sm text-red-200 flex flex-col gap-1 backdrop-blur">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium shrink-0 text-red-300">Lỗi kết nối:</span>
            <span className="text-xs text-red-300/80 truncate flex-1">{bridgeError.split('\n')[0]}</span>
            <a
              href="https://github.com/XiaomiMiMo/MiMo-Code/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="text-mimoorange hover:text-mimoorange-300 underline text-xs shrink-0"
            >
              Tải MiMo CLI
            </a>
            <button
              onClick={() => {
                setShowSettings(true);
              }}
              className="text-mimoorange hover:text-mimoorange-300 underline text-xs shrink-0"
            >
              Cài đặt
            </button>
            <button
              onClick={() => {
                setBridgeError("");
                setStatus("disconnected");
              }}
              className="text-red-400 hover:text-red-300 underline text-xs shrink-0"
            >
              Thử lại
            </button>
          </div>
          {bridgeError.includes('\n') && (
            <details className="text-[10px] text-red-400/80">
              <summary className="cursor-pointer hover:text-red-300">Chi tiết đường dẫn đã kiểm tra</summary>
              <pre className="mt-1 whitespace-pre-wrap font-mono">{bridgeError}</pre>
            </details>
          )}
        </div>
      )}
      <div className="flex-1 flex overflow-hidden">
        <ActivityBar
          activeView={activeView}
          onViewChange={(view) => {
            setActiveView(view);
            setSidebarOpen(true);
          }}
          onOpenSettings={() => setShowSettings(true)}
          onOpenSkills={() => setShowSkills(true)}
        />
        <Sidebar
          open={sidebarOpen}
          activeView={activeView}
          onClose={() => setSidebarOpen(false)}
        />
        <ChatView
          rightPanelOpen={rightPanelOpen}
          onToggleRightPanel={() => setRightPanelOpen((v) => !v)}
        />

        {/* Right panel: project + tasks */}
        {rightPanelOpen && <RightPanel onClose={() => setRightPanelOpen(false)} />}
      </div>

      {showSettings && (
        <SettingsDialog
          onClose={() => setShowSettings(false)}
          onCheckUpdate={() => { setShowSettings(false); setTimeout(() => setShowUpdate(true), 100); }}
        />
      )}
      {showSkills && <SkillsDialog onClose={() => setShowSkills(false)} />}
      {showUpdate && (
        <UpdateDialog onClose={() => setShowUpdate(false)} />
      )}
      <CommandPalette
        open={showPalette}
        onClose={() => setShowPalette(false)}
        onNewChat={startNewChat}
        onOpenSettings={() => setShowSettings(true)}
        onCheckUpdate={() => { setShowSettings(false); setTimeout(() => setShowUpdate(true), 100); }}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onToggleRightPanel={() => setRightPanelOpen((v) => !v)}
      />
      <PiPPlayer />
      <Toast />
      <AppContextMenu
        onNewChat={() => { setShowSkills(false); setShowSettings(false); startNewChat(); }}
        onOpenSkills={() => setShowSkills(true)}
        onOpenSettings={() => setShowSettings(true)}
      />
    </div>
  );
}

export default App;
