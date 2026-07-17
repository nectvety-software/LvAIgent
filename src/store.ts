import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type {
  Message,
  AppSettings,
  ConnectionStatus,
  ModelInfo,
  ChatInfo,
  ProjectInfo,
  ProjectFile,
  ProjectChange,
  SkillDefinition,
  TaskLogEntry,
  TaskItem,
  Workspace,
  Provider,
  AgentConfig,
  AgentLoopStep,
  AgentToolCall,
} from "./types";

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem("mimo_settings");
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    selectedModel: "mimo/mimo-auto",
    agent: {
      accessLevel: "full-access",
      systemPromptsPath: "/session/prompt/",
      storagePath: "",
      autoReadAgentsMd: true,
      enableAgenticLoop: true,
      maxIterations: 25,
    },
  };
}
function saveSettings(s: AppSettings) {
  localStorage.setItem("mimo_settings", JSON.stringify(s));
}

function loadSkills(): SkillDefinition[] {
  try {
    const raw = localStorage.getItem("lvaigent_skills");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSkills(skills: SkillDefinition[]) {
  localStorage.setItem("lvaigent_skills", JSON.stringify(skills));
}

interface CachedProjectSnapshot {
  info: ProjectInfo;
  files: ProjectFile[];
  savedAt: number;
}

function loadProjectSnapshot(path: string): CachedProjectSnapshot | null {
  try {
    return JSON.parse(localStorage.getItem(`lvaigent_project_snapshot:${path}`) || "null") as CachedProjectSnapshot | null;
  } catch {
    return null;
  }
}

function saveProjectSnapshot(path: string, snapshot: CachedProjectSnapshot) {
  try {
    const indexKey = "lvaigent_project_snapshot_index";
    const previous = JSON.parse(localStorage.getItem(indexKey) || "[]") as string[];
    const index = [path, ...previous.filter((item) => item !== path)].slice(0, 4);
    localStorage.setItem(`lvaigent_project_snapshot:${path}`, JSON.stringify(snapshot));
    for (const stalePath of previous.filter((item) => !index.includes(item))) {
      localStorage.removeItem(`lvaigent_project_snapshot:${stalePath}`);
    }
    localStorage.setItem(indexKey, JSON.stringify(index));
  } catch (error) {
    console.warn("Project snapshot cache is unavailable:", error);
  }
}

function chatCacheKey(projectPath?: string | null) {
  return `lvaigent_chat_index:${projectPath || "_global"}`;
}

function parseSkillMarkdown(content: string, sourcePath?: string) {
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  const readField = (field: string) => frontmatter?.[1]
    .match(new RegExp(`^${field}:\\s*["']?(.+?)["']?\\s*$`, "mi"))?.[1]?.trim();
  const fallbackName = sourcePath?.split(/[/\\]/).pop()?.replace(/\.md$/i, "") || "Imported Skill";
  return {
    name: readField("name") || fallbackName,
    description: readField("description") || "Skill được import từ SKILL.md",
  };
}

// Workspace helpers are now in Rust (workspaces.json on disk)

interface ToastInfo {
  type: "success" | "error";
  message?: string;
  path?: string;
}

interface ChatData {
  cid: string;
  title: string;
  messages: Message[];
  model: string;
  session_id: string;
  runtimeSessionId?: string;
  is_pinned: boolean;
  timestamp: number;
}

interface AppState {
  status: ConnectionStatus;
  setStatus: (s: ConnectionStatus) => void;

  settings: AppSettings;
  updateSettings: (s: Partial<AppSettings>) => void;

  messages: Message[];
  addMessage: (m: Message) => void;
  appendToLast: (text: string) => void;
  appendToLastThoughts: (text: string) => void;
  addTaskToLast: (name: string, status: "running" | "success" | "error", detail?: string) => void;
  clearMessages: () => void;

  models: ModelInfo[];
  setModels: (m: ModelInfo[]) => void;

  providers: Provider[];
  setProviders: (p: Provider[]) => void;
  addProvider: (p: Provider) => void;
  updateProvider: (id: string, patch: Partial<Provider>) => void;
  removeProvider: (id: string) => void;
  reconnectProvider: (id: string) => Promise<void>;

  chats: ChatInfo[];
  currentChatCid: string | null;
  setChats: (c: ChatInfo[]) => void;
  setCurrentChat: (cid: string | null) => void;

  isGenerating: boolean;
  setGenerating: (v: boolean) => void;

  pipVisible: boolean;
  pipPlaying: boolean;
  pipTitle: string;
  pipSubtitle: string;
  pipProgress: number;
  pipQueue: { title: string; content: string }[];
  pipIndex: number;
  setPipVisible: (v: boolean) => void;
  setPipPlaying: (v: boolean) => void;
  setPipTitle: (v: string) => void;
  setPipSubtitle: (v: string) => void;
  setPipProgress: (v: number) => void;
  setPipQueue: (q: { title: string; content: string }[]) => void;
  setPipIndex: (i: number) => void;

  sendMimoMessage: (message: string, model?: string, files?: string[], displayMessage?: string) => Promise<void>;
  loadMimoModels: () => Promise<void>;

  loadChatList: (projectPath?: string) => Promise<void>;
  loadChat: (cid: string) => Promise<void>;
  saveCurrentChat: () => Promise<void>;
  deleteChat: (cid: string) => Promise<void>;
  togglePinChat: (cid: string) => Promise<void>;
  renameChat: (cid: string, title: string) => Promise<void>;
  startNewChat: () => void;

  chatInput: string;
  setChatInput: (v: string) => void;

  skills: SkillDefinition[];
  importSkill: (content: string, sourcePath?: string) => void;
  toggleSkill: (id: string) => void;
  removeSkill: (id: string) => void;

  toast: ToastInfo | null;
  setToast: (t: ToastInfo | null) => void;
  clearToast: () => void;

  // Project workspace
  currentProject: ProjectInfo | null;
  projectFiles: ProjectFile[];
  projectChanges: ProjectChange[];
  openFilePath: string | null;
  openFileContent: string | null;
  openFileName: string | null;
  openProject: (folderPath: string) => Promise<void>;
  closeProject: () => void;
  openProjectFile: (filePath: string) => Promise<void>;
  closeFile: () => void;
  saveProjectFile: (filePath: string, content: string) => Promise<void>;
  refreshProjectChanges: () => Promise<void>;
  resetProjectChangeTracking: () => Promise<void>;

  // Workspaces
  workspaces: Workspace[];
  addWorkspace: (path: string, name: string) => Promise<void>;
  removeWorkspace: (path: string) => Promise<void>;
  loadWorkspaces: () => Promise<void>;
  ensureDefaultWorkspace: () => Promise<string | null>;
  ensureSessionWorkspace: (responseText: string) => Promise<void>;

  // Task Logs
  taskLogs: TaskLogEntry[];
  addTaskLog: (type: TaskLogEntry["type"], message: string, detail?: string) => string;
  updateTaskLog: (id: string, updates: Partial<Pick<TaskLogEntry, "type" | "message" | "detail">>) => void;
  clearTaskLogs: () => void;

  // Agent
  agentsMdContent: string;
  systemPrompt: string;
  agentLoopSteps: AgentLoopStep[];
  currentAgentStep: AgentLoopStep | null;
  loadAgentsMd: (projectPath: string) => Promise<void>;
  loadSystemPrompt: (promptName: string) => Promise<void>;
  resetAgentLoop: () => void;
  addAgentStep: (step: AgentLoopStep) => void;
  appendAgentObservation: (step: number, text: string) => void;
  appendAgentThought: (step: number, text: string) => void;
  addAgentToolCall: (step: number, call: AgentToolCall) => void;
  setAgentStepCompleted: (step: number) => void;
}

function generateCid(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractTitle(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (firstUser) {
    const text = firstUser.content.slice(0, 60);
    return text + (firstUser.content.length > 60 ? "..." : "");
  }
  return "Cuộc trò chuyện";
}

function sanitizeWorkspaceName(text: string): string {
  const cleaned = text.replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim();
  const truncated = cleaned.slice(0, 40);
  return truncated || "Cuộc trò chuyện";
}

const initialSettings = loadSettings();

export const useStore = create<AppState>((set, get) => ({
  status: "disconnected",
  setStatus: (s) => set({ status: s }),

  settings: initialSettings,
  updateSettings: (s) =>
    set((state) => {
      const newSettings = { ...state.settings, ...s };
      saveSettings(newSettings);
      return { settings: newSettings };
    }),

  messages: [],
  addMessage: (m) =>
    set((s) => ({ messages: [...s.messages, m] })),
  appendToLast: (text) =>
    set((s) => {
      const msgs = [...s.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
          msgs[i] = { ...msgs[i], content: msgs[i].content + text };
          break;
        }
      }
      return { messages: msgs };
    }),
  appendToLastThoughts: (text) =>
    set((s) => {
      const msgs = [...s.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
          msgs[i] = { ...msgs[i], thoughts: (msgs[i].thoughts || "") + text };
          break;
        }
      }
      return { messages: msgs };
    }),
  addTaskToLast: (name, status, detail) =>
    set((s) => {
      const msgs = [...s.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
          const existing = msgs[i].tasks || [];
          const task: TaskItem = { id: `task_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, name, status, detail, timestamp: Date.now() };
          const matchingRunningIndex = status !== "running"
            ? existing.map((item) => item.name).lastIndexOf(name)
            : -1;
          const canUpdate = matchingRunningIndex >= 0 && existing[matchingRunningIndex].status === "running";
          const updated = canUpdate
            ? existing.map((item, index) => index === matchingRunningIndex
                ? { ...item, status, detail: detail || item.detail, timestamp: Date.now() }
                : item)
            : [...existing, task];
          msgs[i] = { ...msgs[i], tasks: updated };
          break;
        }
      }
      return { messages: msgs };
    }),
  clearMessages: () => set({ messages: [] }),

  models: [],
  setModels: (m) => set({ models: m }),

  providers: [],
  setProviders: (p) => set({ providers: p }),
  addProvider: (p) => set((s) => ({ providers: [...s.providers, p] })),
  updateProvider: (id, patch) =>
    set((s) => ({
      providers: s.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),
  removeProvider: (id) =>
    set((s) => ({ providers: s.providers.filter((p) => p.id !== id) })),
  reconnectProvider: async (id) => {
    const provider = get().providers.find((p) => p.id === id);
    if (!provider) return;
    set((s) => ({
      providers: s.providers.map((p) =>
        p.id === id ? { ...p, status: "unknown" as const } : p
      ),
    }));
    try {
      await invoke("reconnect_provider", { id });
      set((s) => ({
        providers: s.providers.map((p) =>
          p.id === id
            ? { ...p, status: "connected" as const, lastChecked: Date.now() }
            : p
        ),
      }));
    } catch {
      set((s) => ({
        providers: s.providers.map((p) =>
          p.id === id ? { ...p, status: "error" as const } : p
        ),
      }));
    }
  },

  chats: [],
  currentChatCid: null,
  setChats: (c) => set({ chats: c }),
  setCurrentChat: (cid) => set({ currentChatCid: cid }),

  isGenerating: false,
  setGenerating: (v) => set({ isGenerating: v }),

  pipVisible: false,
  pipPlaying: false,
  pipTitle: "",
  pipSubtitle: "",
  pipProgress: 0,
  pipQueue: [],
  pipIndex: 0,
  setPipVisible: (v) => set({ pipVisible: v }),
  setPipPlaying: (v) => set({ pipPlaying: v }),
  setPipTitle: (v) => set({ pipTitle: v }),
  setPipSubtitle: (v) => set({ pipSubtitle: v }),
  setPipProgress: (v) => set({ pipProgress: v }),
  setPipQueue: (q) => set({ pipQueue: q }),
  setPipIndex: (i) => set({ pipIndex: i }),

  // ============ Chat History ============

  loadChatList: async (projectPath?: string) => {
    try {
      const state = get();
      const wsPath = state.currentProject?.path || null;
      const cacheKey = chatCacheKey(projectPath || wsPath);
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || "[]") as ChatInfo[];
        if (cached.length > 0) set({ chats: cached });
      } catch {}
      const chats = await invoke<ChatInfo[]>("list_chats_on_disk", { projectPath: projectPath || null, workspacePath: wsPath });
      set({ chats });
      localStorage.setItem(cacheKey, JSON.stringify(chats));
    } catch (e) {
      console.error("Failed to load chat list:", e);
    }
  },

  loadChat: async (cid: string) => {
    try {
      const state = get();
      const wsPath = state.currentProject?.path || null;
      const data = await invoke<ChatData>("load_chat_from_disk", { cid, workspacePath: wsPath });
      await invoke("set_mimo_session_id", {
        sessionId: data.runtimeSessionId || data.session_id || null,
      });
      set({
        currentChatCid: data.cid,
        messages: data.messages || [],
      });
    } catch (e) {
      console.error("Failed to load chat:", e);
    }
  },

  saveCurrentChat: async () => {
    const state = get();
    const msgs = state.messages;
    if (msgs.length === 0) return;

    let cid = state.currentChatCid;
    if (!cid) {
      cid = generateCid();
      set({ currentChatCid: cid });
    }

    const title = extractTitle(msgs);
    const model = state.settings.selectedModel || "";

    const session_id = (await invoke<string | null>("get_mimo_session_id").catch(() => null)) || "";

    const projectPath = state.currentProject?.path || null;
    const wsPath = state.currentProject?.path || null;
    const isPinned = state.chats.find((chat) => chat.cid === cid)?.is_pinned || false;

    try {
      await invoke("save_chat_to_disk", {
        cid,
        title,
        messages: JSON.stringify(msgs),
        model,
        modelSettings: JSON.stringify({
          model,
          temperature: null,
          systemPrompt: state.systemPrompt || "",
          agent: state.settings.agent || null,
        }),
        sessionId: session_id,
        isPinned,
        projectPath,
        workspacePath: wsPath,
      });

      // Update chats list
      const existingChats = get().chats;
      const chatIndex = existingChats.findIndex((c) => c.cid === cid);
      const chatInfo: ChatInfo = {
        cid,
        title,
        is_pinned: isPinned,
        timestamp: Date.now(),
        model,
        session_id,
        project_path: projectPath || undefined,
      };

      if (chatIndex >= 0) {
        const updated = [...existingChats];
        updated[chatIndex] = { ...updated[chatIndex], title, timestamp: Date.now() };
        set({ chats: updated });
      } else {
        set({ chats: [chatInfo, ...existingChats] });
      }
    } catch (e) {
      console.error("Failed to save chat:", e);
    }
  },

  deleteChat: async (cid: string) => {
    try {
      const state = get();
      const wsPath = state.currentProject?.path || null;
      await invoke("delete_chat_from_disk", { cid, workspacePath: wsPath });
      set({
        chats: state.chats.filter((c) => c.cid !== cid),
        currentChatCid: state.currentChatCid === cid ? null : state.currentChatCid,
        messages: state.currentChatCid === cid ? [] : state.messages,
      });
    } catch (e) {
      console.error("Failed to delete chat:", e);
    }
  },

  togglePinChat: async (cid: string) => {
    const state = get();
    const chat = state.chats.find((c) => c.cid === cid);
    if (!chat) return;

    const newPinned = !chat.is_pinned;
    try {
      const wsPath = state.currentProject?.path || null;
      await invoke("update_chat_pinned", { cid, isPinned: newPinned, workspacePath: wsPath });
      set({
        chats: state.chats.map((c) =>
          c.cid === cid ? { ...c, is_pinned: newPinned } : c
        ),
      });
    } catch (e) {
      console.error("Failed to pin chat:", e);
    }
  },

  renameChat: async (cid: string, title: string) => {
    try {
      const state = get();
      const wsPath = state.currentProject?.path || null;
      await invoke("update_chat_title", { cid, title, workspacePath: wsPath });
      set((s) => ({
        chats: s.chats.map((c) =>
          c.cid === cid ? { ...c, title } : c
        ),
      }));
    } catch (e) {
      console.error("Failed to rename chat:", e);
    }
  },

  startNewChat: () => {
    const state = get();
    const cid = generateCid();
    const model = state.settings.selectedModel || "";
    const workspacePath = state.currentProject?.path || null;
    set({ currentChatCid: cid, messages: [] });
    void invoke("set_mimo_session_id", { sessionId: null });
    void invoke("save_chat_to_disk", {
      cid,
      title: "Cuộc trò chuyện mới",
      messages: "[]",
      model,
      modelSettings: JSON.stringify({
        model,
        temperature: null,
        systemPrompt: state.systemPrompt || "",
        agent: state.settings.agent || null,
      }),
      sessionId: "",
      isPinned: false,
      projectPath: workspacePath,
      workspacePath,
    }).then(() => get().loadChatList(workspacePath || undefined)).catch((e) => {
      console.error("Failed to initialize local session:", e);
    });
  },

  chatInput: "",

  setChatInput: (v) => set({ chatInput: v }),

  skills: loadSkills(),
  importSkill: (content, sourcePath) => {
    const metadata = parseSkillMarkdown(content, sourcePath);
    const workspacePath = get().currentProject?.path;
    const skill: SkillDefinition = {
      id: `skill_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ...metadata,
      content,
      enabled: true,
      sourcePath,
      workspacePath,
      importedAt: Date.now(),
    };
    set((state) => {
      const withoutDuplicate = state.skills.filter((item) =>
        !(item.name.toLowerCase() === skill.name.toLowerCase() && item.workspacePath === skill.workspacePath)
      );
      const skills = [skill, ...withoutDuplicate];
      saveSkills(skills);
      return { skills };
    });
  },
  toggleSkill: (id) => set((state) => {
    const skills = state.skills.map((skill) => skill.id === id ? { ...skill, enabled: !skill.enabled } : skill);
    saveSkills(skills);
    return { skills };
  }),
  removeSkill: (id) => set((state) => {
    const skills = state.skills.filter((skill) => skill.id !== id);
    saveSkills(skills);
    return { skills };
  }),

  // ============ Workspaces (synced via workspaces.json on disk) ============

  workspaces: [],

  addWorkspace: async (path, name) => {
    try {
      const updated = await invoke<Workspace[]>("add_workspace", { path, name });
      set({ workspaces: updated });
    } catch (e) {
      console.error("Failed to add workspace:", e);
    }
  },

  removeWorkspace: async (path) => {
    try {
      await invoke("remove_workspace", { path });
      set((s) => ({ workspaces: s.workspaces.filter((w) => w.path !== path) }));
    } catch (e) {
      console.error("Failed to remove workspace:", e);
    }
  },

  loadWorkspaces: async () => {
    try {
      const ws = await invoke<Workspace[]>("list_workspaces");
      set({ workspaces: ws });
    } catch (e) {
      console.error("Failed to load workspaces:", e);
    }
  },

  ensureDefaultWorkspace: async () => {
    return null;
  },

  ensureSessionWorkspace: async (responseText: string) => {
    const state = get();
    if (state.currentProject) return;
    const name = sanitizeWorkspaceName(responseText);
    if (state.workspaces.length > 0) {
      const ws = state.workspaces[0];
      const exists = await invoke<boolean>("check_path_exists", { path: ws.path }).catch(() => false);
      if (exists) return;
      await get().addWorkspace(ws.path, name);
      return;
    }
    const wsPath = `mimo://session/${Date.now()}`;
    await get().addWorkspace(wsPath, name);
  },

  // ============ Mimo ============

  sendMimoMessage: async (message: string, model?: string, files?: string[], displayMessage?: string) => {
    const state = get();
    if (state.isGenerating) return;

    if (state.currentProject) {
      await state.resetProjectChangeTracking();
    }
    const runtimeSessionId = await invoke<string | null>("get_mimo_session_id").catch(() => null);

    // Prepend project context if a project is open
    let finalMessage = message;
    if (state.currentProject) {
      const openInfo = state.openFilePath
        ? `\n[File đang mở: ${state.openFilePath}]`
        : "";
      finalMessage =
        `[Bạn đang làm việc trong dự án: ${state.currentProject.path}]` +
        `[Cấu trúc dự án:\n${state.currentProject.tree}]` +
        openInfo +
        `\n\n---\n${message}`;
    }
    if (!runtimeSessionId && state.currentChatCid && state.messages.length > 0) {
      const history = state.messages
        .slice(-20)
        .map((item) => `${item.role.toUpperCase()}: ${item.content}`)
        .join("\n\n");
      finalMessage = `[Lịch sử phiên local-first để tiếp tục công việc]\n${history}\n\n---\n${finalMessage}`;
    }

    // Add user message
    state.clearTaskLogs();
    state.addMessage({
      id: `user_${Date.now()}`,
      role: "user",
      content: displayMessage || message,
      timestamp: Date.now(),
    });

    // Add empty assistant message for streaming
    state.addMessage({
      id: `assistant_${Date.now() + 1}`,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    });

    state.setGenerating(true);
    state.addTaskLog("running", "Đang gửi tin nhắn...");

    try {
      await invoke("send_mimo_message", {
        message: finalMessage,
        model: model || state.settings.selectedModel || undefined,
        files: files && files.length > 0 ? files : undefined,
      });
    } catch (e) {
      console.error("send_mimo_message failed:", e);
      state.appendToLast(`\n\n[Lỗi: ${e}]`);
      state.addTaskLog("error", `Gửi tin nhắn thất bại: ${e}`);
      state.setGenerating(false);
    }
  },

  loadMimoModels: async () => {
    const models = await invoke<ModelInfo[]>("list_mimo_models");
    set({ models });
  },

  toast: null,
  setToast: (t) => set({ toast: t }),
  clearToast: () => set({ toast: null }),

  // ============ Project Workspace ============

  currentProject: null,
  projectFiles: [],
  projectChanges: [],
  openFilePath: null,
  openFileContent: null,
  openFileName: null,

  openProject: async (folderPath: string) => {
    try {
      const folderName = folderPath.split(/[/\\]/).pop() || folderPath;
      const cached = loadProjectSnapshot(folderPath);
      set({
        currentProject: cached?.info || {
          folder: folderName,
          path: folderPath,
          tree: `${folderName}/`,
          file_count: cached?.files.length || 0,
          folder_count: 0,
          entries: cached?.files.map((file) => file.path) || [],
        },
        projectFiles: cached?.files || [],
        projectChanges: [],
        openFilePath: null,
        openFileContent: null,
        openFileName: null,
      });

      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await invoke("set_project_path", { path: folderPath });
      const [info, files] = await Promise.all([
        invoke<ProjectInfo>("scan_project_folder", { folderPath }),
        invoke<ProjectFile[]>("list_project_files", { folderPath }),
      ]);
      set({
        currentProject: info,
        projectFiles: files,
        projectChanges: [],
        openFilePath: null,
        openFileContent: null,
        openFileName: null,
      });
      // Keep the project-opening frame responsive: persistence and the change
      // baseline are useful, but neither needs to block the first fresh render.
      window.setTimeout(() => {
        saveProjectSnapshot(folderPath, { info, files, savedAt: Date.now() });
      }, 100);
      window.setTimeout(() => {
        void invoke("reset_project_change_tracking", { projectPath: folderPath }).catch((error) => {
          console.warn("Deferred change cache failed:", error);
        });
      }, 250);
      void get().addWorkspace(folderPath, folderName);
      void get().loadChatList(folderPath);
    } catch (e) {
      console.error("Failed to open project:", e);
      throw e;
    }
  },

  closeProject: async () => {
    await invoke("set_project_path", { path: null as any });
    set({
      currentProject: null,
      projectFiles: [],
      projectChanges: [],
      openFilePath: null,
      openFileContent: null,
      openFileName: null,
    });
  },

  openProjectFile: async (filePath: string) => {
    try {
      const content = await invoke<string>("read_file_content", { filePath });
      const name = filePath.split(/[/\\]/).pop() || filePath;
      set({
        openFilePath: filePath,
        openFileContent: content,
        openFileName: name,
      });
    } catch (e) {
      console.error("Failed to read file:", e);
      throw e;
    }
  },

  closeFile: () => set({
    openFilePath: null,
    openFileContent: null,
    openFileName: null,
  }),

  saveProjectFile: async (filePath: string, content: string) => {
    try {
      await invoke("write_project_file", { filePath, content });
      set({ openFileContent: content });
    } catch (e) {
      console.error("Failed to save file:", e);
      throw e;
    }
  },

  resetProjectChangeTracking: async () => {
    const projectPath = get().currentProject?.path;
    if (!projectPath) return;
    await invoke("reset_project_change_tracking", { projectPath });
    set({ projectChanges: [] });
  },

  refreshProjectChanges: async () => {
    const state = get();
    const projectPath = state.currentProject?.path;
    if (!projectPath) return;
    try {
      const changes = await invoke<ProjectChange[]>("poll_project_changes", { projectPath });
      set({ projectChanges: changes });

      const knownPaths = new Set(state.projectFiles.map((file) => file.path.replace(/\\/g, "/")));
      const structuralChange = changes.some((change) =>
        (change.status === "added" && !knownPaths.has(change.path)) ||
        (change.status === "deleted" && knownPaths.has(change.path))
      );
      if (structuralChange) {
        const files = await invoke<ProjectFile[]>("list_project_files", { folderPath: projectPath });
        set({ projectFiles: files });
      }
    } catch (e) {
      console.error("Failed to refresh project changes:", e);
    }
  },

  // Task Logs
  taskLogs: [],
  addTaskLog: (type, message, detail) => {
    const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entry: TaskLogEntry = { id, type, message, timestamp: Date.now(), detail };
    set((s) => {
      const newLogs = [...s.taskLogs, entry];
      return { taskLogs: newLogs.length > 50 ? newLogs.slice(-50) : newLogs };
    });
    return id;
  },
  updateTaskLog: (id, updates) =>
    set((s) => ({
      taskLogs: s.taskLogs.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    })),
  clearTaskLogs: () => set({ taskLogs: [] }),

  // ============ Agent ============
  agentsMdContent: "",
  systemPrompt: "",
  agentLoopSteps: [],
  currentAgentStep: null,

  loadAgentsMd: async (projectPath: string) => {
    try {
      const content = await invoke<string>("read_file_content", {
        filePath: `${projectPath}\\AGENTS.md`,
      });
      set({ agentsMdContent: content });
    } catch {
      set({ agentsMdContent: "" });
    }
  },

  loadSystemPrompt: async (promptName: string) => {
    try {
      const { settings } = get();
      const basePath = settings.agent?.systemPromptsPath || "/session/prompt/";
      const content = await invoke<string>("read_file_content", {
        filePath: `${basePath}${promptName}.md`,
      });
      set({ systemPrompt: content });
    } catch {
      set({ systemPrompt: "" });
    }
  },

  resetAgentLoop: () => set({ agentLoopSteps: [], currentAgentStep: null }),

  addAgentStep: (step) =>
    set((s) => ({
      agentLoopSteps: [...s.agentLoopSteps, step],
      currentAgentStep: step,
    })),

  appendAgentObservation: (step, text) =>
    set((s) => ({
      agentLoopSteps: s.agentLoopSteps.map((st) =>
        st.step === step ? { ...st, observation: st.observation + text } : st
      ),
    })),

  appendAgentThought: (step, text) =>
    set((s) => ({
      agentLoopSteps: s.agentLoopSteps.map((st) =>
        st.step === step ? { ...st, thought: st.thought + text } : st
      ),
    })),

  addAgentToolCall: (step, call) =>
    set((s) => ({
      agentLoopSteps: s.agentLoopSteps.map((st) =>
        st.step === step
          ? { ...st, toolCalls: [...st.toolCalls, call] }
          : st
      ),
    })),

  setAgentStepCompleted: (step) =>
    set((s) => ({
      agentLoopSteps: s.agentLoopSteps.map((st) =>
        st.step === step ? { ...st, completed: true } : st
      ),
    })),
}));
