import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowUp,
  Plus,
  Image,
  FileText,
  Pen,
  Languages,
  BookOpen,
  Brain,
  Paperclip,
  X,
  Sparkles,
  File as FileIcon,
  Lightbulb,
  ChevronDown,
  Subtitles,
  FolderCode,
  Bot,
  MessageSquare,
  PanelRightOpen,
  Command,
  Hash,
  AtSign,
} from "lucide-react";
import { useStore } from "../store";
import MessageBubble from "./MessageBubble";

interface FileAttachment {
  name: string;
  path: string;
  type: "file" | "image";
}

const QUICK_TOOLS = [
  {
    icon: Plus,
    label: "Nhập tệp",
    action: "file",
    desc: "PDF, DOC, TXT, SRT...",
  },
  {
    icon: Pen,
    label: "Viết",
    action: "write",
    desc: "Soạn thảo nội dung",
  },
  {
    icon: Languages,
    label: "Dịch",
    action: "translate",
    desc: "Dịch sang ngôn ngữ...",
  },
  {
    icon: BookOpen,
    label: "Bài tập",
    action: "homework",
    desc: "Giải bài tập",
  },
  {
    icon: Subtitles,
    label: "Dịch SRT",
    action: "srt",
    desc: "Dịch phụ đề .srt",
  },
  {
    icon: FolderCode,
    label: "Agent",
    action: "agent",
    desc: "Phân tích & code dự án",
  },
];

const MIMO_COMMANDS = [
  { value: "/help", label: "/help", description: "Hiển thị trợ giúp MiMo Code" },
  { value: "/models", label: "/models", description: "Xem và chọn mô hình" },
  { value: "/new", label: "/new", description: "Bắt đầu phiên MiMo mới" },
  { value: "/clear", label: "/clear", description: "Làm sạch ngữ cảnh hiện tại" },
  { value: "/compact", label: "/compact", description: "Thu gọn ngữ cảnh hội thoại" },
  { value: "/agent", label: "/agent", description: "Chuyển sang chế độ Agent" },
  { value: "/chat", label: "/chat", description: "Chuyển sang chế độ Chat" },
  { value: "/dream", label: "/dream", description: "Trích xuất kiến thức vào bộ nhớ MiMo" },
  { value: "/distill", label: "/distill", description: "Tạo workflow có thể tái sử dụng" },
];

const SUBAGENTS = [
  { name: "planner", description: "Phân rã yêu cầu và lập kế hoạch triển khai" },
  { name: "explorer", description: "Khám phá codebase, dependency và luồng dữ liệu" },
  { name: "implementer", description: "Triển khai thay đổi mã nguồn theo kế hoạch" },
  { name: "reviewer", description: "Review correctness, maintainability và regression" },
  { name: "tester", description: "Viết/chạy test và phân tích lỗi kiểm thử" },
  { name: "debugger", description: "Khoanh vùng nguyên nhân và sửa lỗi runtime" },
  { name: "security", description: "Kiểm tra bảo mật, dữ liệu nhạy cảm và quyền truy cập" },
  { name: "optimizer", description: "Tối ưu hiệu năng, I/O, cache và mức dùng bộ nhớ" },
];

interface InputSuggestion {
  value: string;
  label: string;
  description: string;
  kind: "command" | "skill" | "file" | "subagent";
}

const WRITE_TEMPLATES = [
  { label: "Email chuyên nghiệp", prompt: "Viết một email chuyên nghiệp với nội dung: " },
  { label: "Bài viết blog", prompt: "Viết một bài blog hay và hấp dẫn về chủ đề: " },
  { label: "Báo cáo", prompt: "Viết một báo cáo tổng quan về: " },
  { label: "Thư xin việc", prompt: "Viết một thư xin việc cho vị trí: " },
  { label: "Tóm tắt", prompt: "Tóm tắt nội dung sau thành các ý chính:\n\n" },
  { label: "Viết lại", prompt: "Viết lại nội dung sau cho rõ ràng và chuyên nghiệp hơn:\n\n" },
];



const TRANSLATE_LANGS = [
  { code: "en", label: "Tiếng Anh", flag: "🇺🇸" },
  { code: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
  { code: "ja", label: "Tiếng Nhật", flag: "🇯🇵" },
  { code: "ko", label: "Tiếng Hàn", flag: "🇰🇷" },
  { code: "zh", label: "Tiếng Trung", flag: "🇨🇳" },
  { code: "fr", label: "Tiếng Pháp", flag: "🇫🇷" },
  { code: "de", label: "Tiếng Đức", flag: "🇩🇪" },
  { code: "es", label: "Tiếng Tây Ban Nha", flag: "🇪🇸" },
  { code: "th", label: "Tiếng Thái", flag: "🇹🇭" },
];

const HOMEWORK_TEMPLATES = [
  { label: "Toán học", prompt: "Giải bài toán toán học sau:\n\n" },
  { label: "Vật lý", prompt: "Giải bài tập vật lý sau:\n\n" },
  { label: "Hóa học", prompt: "Giải bài tập hóa học sau:\n\n" },
  { label: "Sinh học", prompt: "Trả lời câu hỏi sinh học sau:\n\n" },
  { label: "Ngữ văn", prompt: "Phân tích và trả lời câu hỏi văn học sau:\n\n" },
  { label: "Tiếng Anh", prompt: "Giải bài tập tiếng Anh sau:\n\n" },
  { label: "Lịch sử", prompt: "Trả lời câu hỏi lịch sử sau:\n\n" },
  { label: "Địa lý", prompt: "Trả lời câu hỏi địa lý sau:\n\n" },
];

interface ChatViewProps {
  rightPanelOpen?: boolean;
  onToggleRightPanel?: () => void;
}

export default function ChatView({ rightPanelOpen = true, onToggleRightPanel }: ChatViewProps) {
  const {
    messages,
    addMessage,
    isGenerating,
    setGenerating,
    status,
    clearMessages,
    setCurrentChat,
    sendMimoMessage,
    settings,
    setToast,
    currentProject,
    openProject,
    addTaskLog,
    loadAgentsMd,
    agentsMdContent,
    resetAgentLoop,
    projectFiles,
    skills,
    startNewChat,
  } = useStore();

  const chatInput = useStore((s) => s.chatInput);
  const setChatInput = useStore((s) => s.setChatInput);
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [translateLang, setTranslateLang] = useState("en");
  const [srtTranslating, setSrtTranslating] = useState(false);
  const [srtProgress, setSrtProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [agentMode, setAgentMode] = useState<"chat" | "agent">("chat");
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [, forceUpdate] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const inputTrigger = useMemo(() => chatInput.match(/(?:^|\s)([/#@$])([^\s]*)$/), [chatInput]);
  const canRunLocally = ["/new", "/clear", "/agent", "/chat"].includes(chatInput.trim());
  const inputSuggestions = useMemo<InputSuggestion[]>(() => {
    if (!inputTrigger) return [];
    const trigger = inputTrigger[1];
    const query = inputTrigger[2].toLowerCase();
    if (trigger === "/") {
      return MIMO_COMMANDS.filter((item) => item.label.slice(1).toLowerCase().includes(query))
        .map((item) => ({ ...item, kind: "command" as const }));
    }
    if (trigger === "#") {
      return skills
        .filter((skill) => skill.enabled && (!skill.workspacePath || skill.workspacePath === currentProject?.path))
        .filter((skill) => skill.name.toLowerCase().includes(query))
        .map((skill) => ({ value: `#${skill.name}`, label: `#${skill.name}`, description: skill.description, kind: "skill" as const }));
    }
    if (trigger === "$") {
      return SUBAGENTS
        .filter((agent) => agent.name.includes(query))
        .map((agent) => ({ value: `$${agent.name}`, label: `$${agent.name}`, description: agent.description, kind: "subagent" as const }));
    }
    const knownFiles = new Set(projectFiles.map((file) => file.path.replace(/\\/g, "/")));
    const entries = [...new Set([
      ...(currentProject?.entries || []).map((entry) => entry.replace(/^\/+/, "").replace(/\\/g, "/")),
      ...knownFiles,
    ])];
    return entries
      .filter((entry) => entry.toLowerCase().includes(query))
      .slice(0, 30)
      .map((entry) => ({
        value: `@${entry}`,
        label: `@${entry}`,
        description: knownFiles.has(entry) ? "Tệp trong dự án đang mở" : "Thư mục trong dự án đang mở",
        kind: "file" as const,
      }));
  }, [inputTrigger, skills, currentProject?.path, currentProject?.entries, projectFiles]);

  useEffect(() => setSuggestionIndex(0), [inputTrigger?.[0]]);

  const applyInputSuggestion = useCallback((suggestion: InputSuggestion) => {
    const nextValue = chatInput.replace(/([/#@$])[^\s]*$/, `${suggestion.value} `);
    setChatInput(nextValue);
    setSuggestionIndex(0);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, [chatInput, setChatInput]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [chatInput]);

  // Load AGENTS.md when switching to agent mode with an open project
  useEffect(() => {
    if (agentMode === "agent" && currentProject && settings.agent?.autoReadAgentsMd) {
      loadAgentsMd(currentProject.path);
    }
  }, [agentMode, currentProject]);

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    if (activeMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [activeMenu]);

  // Listen to SRT progress events
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const unlisten = listen<{ current: number; total: number; percent: number }>("srt-progress", (event) => {
      setSrtProgress(event.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      for (const f of droppedFiles) {
        setFiles((prev) => [
          ...prev,
          {
            name: f.name,
            path: (f as any).path || f.name,
            type: f.type.startsWith("image/") ? "image" : "file",
          },
        ]);
      }
    },
    []
  );

  const pickFiles = useCallback(async (accept?: string) => {
    try {
      const selected = await openDialog({
        multiple: true,
        filters: accept
          ? [{ name: "Files", extensions: accept.split(",") }]
          : [
              {
                name: "All supported",
                extensions: [
                  "pdf", "txt", "doc", "docx", "srt",
                  "png", "jpg", "jpeg", "webp", "gif",
                  "mp4", "mp3", "csv", "xlsx", "pptx",
                ],
              },
            ],
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        for (const p of paths) {
          const name = p.split("\\").pop() || p.split("/").pop() || p;
          const ext = name.split(".").pop()?.toLowerCase() || "";
          const isImg = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext);
          setFiles((prev) => [
            ...prev,
            { name, path: p, type: isImg ? "image" : "file" },
          ]);
        }
      }
    } catch (e) {
      console.error("File dialog error:", e);
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const insertPrompt = useCallback((prompt: string) => {
    setChatInput(prompt);
    setActiveMenu(null);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(prompt.length, prompt.length);
      }
    }, 0);
  }, []);

  const send = useCallback(() => {
    const text = chatInput.trim();
    if (!text || isGenerating) return;

    if (text === "/new" || text === "/clear") {
      setChatInput("");
      startNewChat();
      return;
    }
    if (text === "/agent") {
      setChatInput("");
      if (currentProject) setAgentMode("agent");
      else setToast({ type: "error", message: "Hãy mở một dự án trước khi bật Agent." });
      return;
    }
    if (text === "/chat") {
      setChatInput("");
      setAgentMode("chat");
      return;
    }
    if (status !== "connected") return;

    setChatInput("");
    const mentionedFiles = currentProject
      ? projectFiles
          .filter((file) => text.includes(`@${file.path.replace(/\\/g, "/")}`))
          .map((file) => `${currentProject.path.replace(/[\\/]$/, "")}\\${file.path}`)
      : [];
    const filePaths = [...new Set([...files.map((f) => f.path), ...mentionedFiles])];
    setFiles([]);

    const model = settings.selectedModel || undefined;
    const referencedSkills = skills.filter((skill) =>
      skill.enabled &&
      (!skill.workspacePath || skill.workspacePath === currentProject?.path) &&
      text.toLowerCase().includes(`#${skill.name.toLowerCase()}`)
    );
    const skillSection = referencedSkills.length > 0
      ? `\n## Skills được gọi\n${referencedSkills.map((skill) => `\n### ${skill.name}\n${skill.content}`).join("\n")}\n`
      : "";
    const referencedSubagents = SUBAGENTS.filter((agent) => text.toLowerCase().includes(`$${agent.name}`));
    const subagentSection = referencedSubagents.length > 0
      ? `\n## Subagents được gọi\nHãy phân công và phối hợp các vai trò sau, tổng hợp kết quả trước khi trả lời:\n${referencedSubagents.map((agent) => `- ${agent.name}: ${agent.description}`).join("\n")}\n`
      : "";

    if (agentMode === "agent" && currentProject) {
      // Load AGENTS.md rules if enabled
      if (settings.agent?.autoReadAgentsMd) {
        loadAgentsMd(currentProject.path);
      }
      resetAgentLoop();

      const accessLevel = settings.agent?.accessLevel || "full-access";
      const agentDesc =
        accessLevel === "full-access"
          ? "Bạn có TOÀN QUYỀN truy cập: sửa code, tạo file, thực thi lệnh bash, debug, triển khai."
          : accessLevel === "read-only"
          ? "Bạn chỉ có quyền ĐỌC: phân tích code, đề xuất thay đổi nhưng KHÔNG tự ý sửa."
          : "Bạn hoạt động trong môi trường SANDBOX: các thay đổi chỉ có hiệu lực trong phiên làm việc.";

      const rulesSection = agentsMdContent
        ? `\n## Rules từ dự án (AGENTS.md)\n${agentsMdContent}\n`
        : "";

      const agentPrompt =
        `[AGENT MODE - ${accessLevel.toUpperCase()}]\n` +
        `Bạn đang ở chế độ Agent làm việc trong dự án "${currentProject.folder}".\n` +
        `${agentDesc}\n` +
        `\n## Vòng lặp Agentic\n` +
        `Xử lý yêu cầu theo vòng lặp: Observation → Thought → Tool Call → Action → Observation.\n` +
        `- Observation: Quan sát trạng thái hiện tại của dự án\n` +
        `- Thought: Suy nghĩ về giải pháp\n` +
        `- Tool Call: Gọi công cụ (đọc file, ghi file, grep, shell, LSP)\n` +
        `- Action: Thực thi thay đổi\n` +
        `- Observation: Xem kết quả và lặp lại cho đến khi hoàn thành\n` +
        `\nCác tool có sẵn:\n` +
        `- read_file: Đọc nội dung file\n` +
        `- write_file: Ghi nội dung file\n` +
        `- grep_search: Tìm kiếm trong mã nguồn\n` +
        `- shell_exec: Thực thi lệnh bash\n` +
        `- lsp_analyze: Phân tích cú pháp qua LSP\n` +
        `- list_files: Liệt kê file trong thư mục\n` +
        `${rulesSection}${skillSection}${subagentSection}` +
        `\n---\nYêu cầu: ${text}`;
      sendMimoMessage(agentPrompt, model, filePaths.length > 0 ? filePaths : undefined, text);
    } else {
      const promptContext = `${skillSection}${subagentSection}`;
      const prompt = promptContext ? `${promptContext}\n---\nYêu cầu: ${text}` : text;
      sendMimoMessage(prompt, model, filePaths.length > 0 ? filePaths : undefined, text);
    }
  }, [
    chatInput,
    isGenerating,
    status,
    settings.selectedModel,
    sendMimoMessage,
    files,
    agentMode,
    currentProject,
    projectFiles,
    skills,
    startNewChat,
    setToast,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (inputSuggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSuggestionIndex((index) => (index + 1) % inputSuggestions.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSuggestionIndex((index) => (index - 1 + inputSuggestions.length) % inputSuggestions.length);
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          applyInputSuggestion(inputSuggestions[suggestionIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setChatInput(`${chatInput} `);
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send, inputSuggestions, suggestionIndex, applyInputSuggestion, chatInput, setChatInput]
  );

  const handlePickProjectFolder = useCallback(async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Chọn thư mục dự án",
      });
      if (!selected) return;

      const folderPath = Array.isArray(selected) ? selected[0] : selected;
      await openProject(folderPath);

      const project = useStore.getState().currentProject;
      if (project) {
        addMessage({
          id: `sys_project_${Date.now()}`,
          role: "system",
          content: `Đã mở dự án: ${project.folder}\n${project.file_count} file, ${project.folder_count} thư mục con\n\nCấu trúc:\n${project.tree}`,
          timestamp: Date.now(),
        });
      }
      forceUpdate((n) => n + 1);
    } catch (e) {
      addMessage({
        id: `sys_project_err_${Date.now()}`,
        role: "system",
        content: `Lỗi mở dự án: ${e}`,
        timestamp: Date.now(),
      });
      console.error("Folder picker error:", e);
    }
  }, [addMessage, openProject]);

  const handleAgentAction = useCallback(async (action: string) => {
    setActiveMenu(null);

    const project = useStore.getState().currentProject;

    if (action === "pick_folder") {
      handlePickProjectFolder();
      return;
    }

    if (!project) {
      addMessage({
        id: `sys_agent_err_${Date.now()}`,
        role: "system",
        content: "Vui lòng mở dự án trước (Mở dự án ở sidebar hoặc nhấn Agent > Chọn thư mục).",
        timestamp: Date.now(),
      });
      return;
    }

    // Build context message with folder tree and path
    const contextPrefix = `[Dự án: ${project.path}]\n[Cấu trúc thư mục:\n${project.tree}]\n\n`;

    let prompt = "";
    switch (action) {
      case "analyze":
        prompt = contextPrefix + "Phân tích dự án này. Cho tôi biết: cấu trúc, công nghệ sử dụng, các file quan trọng, và gợi ý cải thiện.";
        break;
      case "create":
        prompt = contextPrefix + "Hãy tạo các file cần thiết cho dự án này. Viết nội dung file đầy đủ, không viết tắt.";
        break;
      case "fix":
        prompt = contextPrefix + "Kiểm tra và sửa lỗi trong dự án này. Đọc nội dung các file quan trọng và đề xuất sửa lỗi cụ thể.";
        break;
      case "explain":
        prompt = contextPrefix + "Giải thích cách dự án này hoạt động, flow chính và các phần quan trọng. Phân tích từng file chính.";
        break;
      default:
        return;
    }

    const store = useStore.getState();
    const openFile = store.openFilePath;
    const openContent = store.openFileContent;
    const openName = store.openFileName;
    if (openFile && openContent) {
      const ext = (openName || "").split(".").pop() || "";
      prompt += `\n\n[File đang mở: ${openFile}]\n\`\`\`${ext}\n${openContent.slice(0, 3000)}\n\`\`\``;
    }

    setChatInput(prompt);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(prompt.length, prompt.length);
      }
    }, 0);
  }, [addMessage, handlePickProjectFolder]);

  const handleToolAction = useCallback(
    (action: string) => {
      switch (action) {
        case "file":
          pickFiles();
          break;
        case "image":
          pickFiles("png,jpg,jpeg,webp,gif");
          break;
        case "srt": {
          // Check if SRT file already attached
          const hasSrt = files.some((f) => f.name.toLowerCase().endsWith(".srt"));
          if (hasSrt) {
            // File ready, show language menu directly
            setActiveMenu(activeMenu === "srt" ? null : "srt");
          } else {
            // Need to pick file first, then show language menu
            setActiveMenu("srt_pick");
          }
          break;
        }
        case "agent":
          setActiveMenu(activeMenu === "agent" ? null : "agent");
          break;
        case "write":
        case "video":
        case "imagegen":
        case "translate":
        case "homework":
          setActiveMenu(activeMenu === action ? null : action);
          break;
      }
    },
    [pickFiles, activeMenu, files]
  );

  const handleSrtPickFile = useCallback(async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: "SRT Subtitles", extensions: ["srt"] }],
      });
      if (!selected) {
        setActiveMenu(null);
        return;
      }
      const filePath = Array.isArray(selected) ? selected[0] : selected;
      const fileName = filePath.split("\\").pop() || filePath.split("/").pop() || "subtitle.srt";

      // Add SRT file to attached files
      setFiles((prev) => [
        ...prev,
        { name: fileName, path: filePath, type: "file" },
      ]);

      // Now show language menu
      setActiveMenu("srt");
    } catch (e) {
      console.error("File picker error:", e);
      setActiveMenu(null);
    }
  }, [setFiles]);

  const handleTranslateSrt = useCallback(async (lang: string) => {
    setActiveMenu(null);

    // Find SRT file from attached files
    const srtFile = files.find((f) => f.name.toLowerCase().endsWith(".srt"));
    if (!srtFile) {
      addMessage({
        id: `sys_srt_err_${Date.now()}`,
        role: "system",
        content: "Không tìm thấy file .srt. Vui lòng chọn file phụ đề trước.",
        timestamp: Date.now(),
      });
      return;
    }

    const filePath = srtFile.path;
    const langLabel = TRANSLATE_LANGS.find((l) => l.code === lang)?.label || lang;

    setSrtTranslating(true);
    setSrtProgress({ current: 0, total: 0, percent: 0 });
    addTaskLog("running", `Đang dịch SRT: ${srtFile.name} → ${langLabel}`);

    addMessage({
      id: `sys_srt_${Date.now()}`,
      role: "system",
      content: `Đang dịch "${srtFile.name}" sang ${langLabel}...`,
      timestamp: Date.now(),
    });

    try {
      const outputPath = await invoke<string>("translate_srt", {
        filePath,
        targetLang: lang,
      });

      setSrtTranslating(false);
      addTaskLog("success", `Dịch SRT hoàn thành`);

      // Remove the SRT file from attached files after success
      setFiles((prev) => prev.filter((f) => f.path !== filePath));

      addMessage({
        id: `sys_srt_done_${Date.now()}`,
        role: "system",
        content: `Dịch phụ đề thành công! File lưu tại: ${outputPath}`,
        timestamp: Date.now(),
      });

      // Show toast with open folder button
      setToast({ type: "success", path: outputPath });
    } catch (e) {
      setSrtTranslating(false);
      console.error("SRT translation error:", e);
      addTaskLog("error", `Lỗi dịch SRT: ${e}`);
      addMessage({
        id: `sys_srt_err_${Date.now()}`,
        role: "system",
        content: `Lỗi dịch phụ đề: ${e}`,
        timestamp: Date.now(),
      });
    }
  }, [files, addMessage, setFiles, addTaskLog]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            setFiles((prev) => [
              ...prev,
              {
                name: file.name || `pasted_${Date.now()}`,
                path: file.name || `pasted_${Date.now()}`,
                type: file.type.startsWith("image/") ? "image" : "file",
              },
            ]);
          }
        }
      }
    },
    []
  );

  const hasMessages = messages.length > 0;

  const renderToolMenu = () => {
    if (!activeMenu) return null;

    if (activeMenu === "write") {
      return (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-[#1a1f2b] border border-[#2f3848] rounded-xl shadow-panel p-2 z-50">
          <p className="text-[10px] font-semibold text-[#5f6b7a] uppercase px-2 mb-1">Chọn loại nội dung</p>
          {WRITE_TEMPLATES.map((t, i) => (
            <button
              key={i}
              onClick={() => insertPrompt(t.prompt)}
              className="w-full text-left px-3 py-2 text-xs text-[#9aa4b2] hover:bg-[#20262f] hover:text-[#e6e9ef] rounded-lg transition-colors flex items-center gap-2"
            >
              <Pen size={12} className="text-[#5f6b7a] shrink-0" />
              {t.label}
            </button>
          ))}
        </div>
      );
    }

    if (activeMenu === "translate") {
      return (
        <div className="absolute bottom-full left-0 mb-2 w-56 bg-[#1a1f2b] border border-[#2f3848] rounded-xl shadow-panel p-2 z-50">
          <p className="text-[10px] font-semibold text-[#5f6b7a] uppercase px-2 mb-1">Dịch sang</p>
          {TRANSLATE_LANGS.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setTranslateLang(lang.code);
                insertPrompt(`Dịch nội dung sau sang ${lang.label}:\n\n`);
              }}
              className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors flex items-center gap-2 ${
                translateLang === lang.code
                  ? "bg-mimoorange-soft text-mimoorange font-medium"
                  : "text-[#9aa4b2] hover:bg-[#20262f] hover:text-[#e6e9ef]"
              }`}
            >
              <span className="text-sm">{lang.flag}</span>
              {lang.label}
            </button>
          ))}
        </div>
      );
    }

    if (activeMenu === "homework") {
      return (
        <div className="absolute bottom-full left-0 mb-2 w-56 bg-[#1a1f2b] border border-[#2f3848] rounded-xl shadow-panel p-2 z-50">
          <p className="text-[10px] font-semibold text-[#5f6b7a] uppercase px-2 mb-1">Chọn môn học</p>
          {HOMEWORK_TEMPLATES.map((t, i) => (
            <button
              key={i}
              onClick={() => insertPrompt(t.prompt)}
              className="w-full text-left px-3 py-2 text-xs text-[#9aa4b2] hover:bg-[#20262f] hover:text-[#e6e9ef] rounded-lg transition-colors flex items-center gap-2"
            >
              <BookOpen size={12} className="text-[#5f6b7a] shrink-0" />
              {t.label}
            </button>
          ))}
        </div>
      );
    }

    if (activeMenu === "srt") {
      const hasSrt = files.some((f) => f.name.toLowerCase().endsWith(".srt"));
      return (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-[#1a1f2b] border border-[#2f3848] rounded-xl shadow-panel p-2 z-50">
          <p className="text-[10px] font-semibold text-[#5f6b7a] uppercase px-2 mb-1">
            {hasSrt ? `Dịch: ${files.find(f => f.name.toLowerCase().endsWith(".srt"))?.name}` : "Chọn ngôn ngữ dịch"}
          </p>
          {TRANSLATE_LANGS.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleTranslateSrt(lang.code)}
              disabled={srtTranslating}
              className="w-full text-left px-3 py-2 text-xs text-[#9aa4b2] hover:bg-[#20262f] hover:text-[#e6e9ef] rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <span className="text-sm">{lang.flag}</span>
              {lang.label}
            </button>
          ))}
          {srtTranslating && (
            <div className="mt-2 px-2">
              <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                <span>Đang dịch...</span>
                <span>{srtProgress.percent}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${srtProgress.percent}%` }}
                />
              </div>
              {srtProgress.total > 0 && (
                <p className="text-[9px] text-gray-400 mt-1">
                  {srtProgress.current}/{srtProgress.total} dòng
                </p>
              )}
            </div>
          )}
        </div>
      );
    }

    if (activeMenu === "srt_pick") {
      return (
        <div className="absolute bottom-full left-0 mb-2 w-56 bg-[#1a1f2b] border border-[#2f3848] rounded-xl shadow-panel p-3 z-50">
          <p className="text-[10px] font-semibold text-[#5f6b7a] uppercase mb-2">Chọn file phụ đề</p>
          <button
            onClick={handleSrtPickFile}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-[#9aa4b2] hover:bg-[#20262f] hover:text-mimoorange rounded-lg transition-colors border border-dashed border-[#2f3848]"
          >
            <Subtitles size={14} className="text-mimoorange" />
            <span>Chọn file .srt</span>
          </button>
          <p className="text-[9px] text-gray-400 mt-2">
            Hoặc thả file .srt vào chat, rồi bấm Dịch SRT
          </p>
        </div>
      );
    }

    if (activeMenu === "agent") {
      const project = useStore.getState().currentProject;
      return (
        <div className="absolute bottom-full left-0 mb-2 w-72 bg-[#1a1f2b] border border-[#2f3848] rounded-xl shadow-panel p-2 z-50">
          <p className="text-[10px] font-semibold text-[#5f6b7a] uppercase px-2 mb-1">
            {project ? `Dự án: ${project.folder}` : "Chọn thư mục dự án"}
          </p>

          {!project ? (
            <button
              onClick={() => handleAgentAction("pick_folder")}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-[#9aa4b2] hover:bg-[#20262f] hover:text-mimoorange rounded-lg transition-colors border border-dashed border-[#2f3848]"
            >
              <FolderCode size={14} className="text-mimoorange" />
              <span>Chọn thư mục dự án</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => handleAgentAction("pick_folder")}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[#9aa4b2] hover:bg-[#20262f] rounded-lg transition-colors mb-1"
              >
                <FolderCode size={12} />
                <span>Đổi thư mục</span>
              </button>

              <div className="border-t border-[#2f3848] my-1" />

              <button
                onClick={() => handleAgentAction("analyze")}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#9aa4b2] hover:bg-[#20262f] hover:text-mimoorange rounded-lg transition-colors"
              >
                <Brain size={12} className="text-mimoorange" />
                <div className="text-left">
                  <div className="font-medium">Phân tích dự án</div>
                  <div className="text-[10px] text-[#5f6b7a]">Xem cấu trúc, công nghệ, gợi ý</div>
                </div>
              </button>

              <button
                onClick={() => handleAgentAction("create")}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#9aa4b2] hover:bg-[#20262f] hover:text-mimoorange rounded-lg transition-colors"
              >
                <Sparkles size={12} className="text-green-400" />
                <div className="text-left">
                  <div className="font-medium">Tạo file</div>
                  <div className="text-[10px] text-[#5f6b7a]">Tạo file mới cho dự án</div>
                </div>
              </button>

              <button
                onClick={() => handleAgentAction("fix")}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#9aa4b2] hover:bg-[#20262f] hover:text-mimoorange rounded-lg transition-colors"
              >
                <FileText size={12} className="text-mimoorange" />
                <div className="text-left">
                  <div className="font-medium">Sửa lỗi</div>
                  <div className="text-[10px] text-[#5f6b7a]">Kiểm tra & sửa lỗi dự án</div>
                </div>
              </button>

              <button
                onClick={() => handleAgentAction("explain")}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#9aa4b2] hover:bg-[#20262f] hover:text-mimoorange rounded-lg transition-colors"
              >
                <BookOpen size={12} className="text-blue-400" />
                <div className="text-left">
                  <div className="font-medium">Giải thích</div>
                  <div className="text-[10px] text-[#5f6b7a]">Giải thích code & flow</div>
                </div>
              </button>

              {project && (
                <div className="mt-2 px-2 py-1.5 bg-[#0b0d12] rounded-lg max-h-24 overflow-y-auto">
                  <p className="text-[9px] text-[#5f6b7a] font-mono whitespace-pre">{project.tree}</p>
                </div>
              )}
            </>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className="uaget-chat flex-1 min-w-0 flex flex-col relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      ref={dragRef}
    >
      {isDragging && (
        <div className="absolute inset-0 z-40 bg-mimoorange/10 border-2 border-dashed border-mimoorange rounded-lg flex items-center justify-center pointer-events-none">
          <div className="bg-[#1a1f2b] rounded-xl px-6 py-4 shadow-panel text-center border border-[#2f3848]">
            <Paperclip size={32} className="mx-auto text-mimoorange mb-2" />
            <p className="text-sm font-medium text-[#e6e9ef]">
              Thả tệp vào đây
            </p>
          </div>
        </div>
      )}

      <div className="uaget-chat-header h-[76px] min-h-[76px] flex items-center px-6 border-b">
        <span className="text-[15px] font-semibold text-[#f1f2f7]">
          {hasMessages ? "Cuộc trò chuyện" : "New chat"}
        </span>
        {!rightPanelOpen && onToggleRightPanel && (
          <button
            onClick={onToggleRightPanel}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-[#777d96] transition-colors hover:bg-[#25253d] hover:text-[#d8dbe7]"
            title="Mở panel tệp"
          >
            <PanelRightOpen size={17} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="uaget-message-canvas flex-1 overflow-y-auto px-8 py-7 chat-scroll">
        {!hasMessages ? (
          <div className="h-full flex flex-col items-center justify-center px-4 animate-fade-in">
            <h1 className="uaget-welcome-title text-[38px] leading-tight font-bold text-[#fbfbfd] mb-3 text-center">
              Bạn muốn học điều gì?
            </h1>
            <p className="text-sm text-[#9aa4b2] text-center max-w-md">
              Hỏi tôi bất cứ điều gì, tải lên tệp để phân tích, hoặc chọn một
              công cụ bên dưới để bắt đầu
            </p>

            <div className="flex flex-wrap gap-2 mt-7 max-w-2xl justify-center">
              {[
                "Viết email chuyên nghiệp",
                "Tóm tắt văn bản",
                "Giải thích code",
                "Dịch sang tiếng Anh",
                "Lên kế hoạch học tập",
              ].map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setChatInput(s);
                    textareaRef.current?.focus();
                  }}
                  className="uaget-suggestion px-3.5 py-2 text-xs rounded-full transition-colors"
                >
                  <Lightbulb size={12} className="inline mr-1 text-mimoorange" />
                  {s}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-[#5f6b7a] mt-4">
              Model: {settings.selectedModel || "mimo/mimo-auto"}
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="uaget-composer-zone px-2 pb-2 pt-4 border-t">
        <div className="max-w-[956px] mx-auto">
          {/* Attached files preview */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {files.map((f, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-[11px] bg-mimoorange-soft border border-mimoorange/30 text-mimoorange px-2 py-0.5 rounded-full"
                >
                  {f.type === "image" ? (
                    <Image size={10} />
                  ) : (
                    <FileIcon size={10} />
                  )}
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <button
                    onClick={() => removeFile(i)}
                    className="text-mimoorange/60 hover:text-red-400 ml-0.5"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Main input box */}
          <div className="uaget-input-bar border rounded-[18px] transition-all relative">
            {/* Agent mode switcher (OpenCode-style) */}
            <div className="flex items-center gap-1 px-3 pt-2.5">
              <div className="uaget-mode-switch flex items-center rounded-lg p-0.5 border">
                <button
                  onClick={() => setAgentMode("chat")}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                    agentMode === "chat"
                      ? "bg-[#1a1f2b] text-[#e6e9ef] font-medium"
                      : "text-[#5f6b7a] hover:text-[#9aa4b2]"
                  }`}
                >
                  <MessageSquare size={12} />
                  Chat
                </button>
                <button
                  onClick={() => setAgentMode("agent")}
                  disabled={!currentProject}
                  title={currentProject ? "Chế độ Agent phân tích dự án" : "Cần mở dự án"}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md transition-colors disabled:opacity-40 ${
                    agentMode === "agent"
                      ? "bg-mimoorange text-white font-medium"
                      : "text-[#5f6b7a] hover:text-[#9aa4b2]"
                  }`}
                >
                  <Bot size={12} />
                  Agent
                </button>
              </div>
              {agentMode === "agent" && currentProject && (
                <span className="text-[10px] text-[#5f6b7a] truncate">
                  {currentProject.folder}
                </span>
              )}
            </div>
            {inputSuggestions.length > 0 && (
              <div className="absolute bottom-[calc(100%+8px)] left-2 right-2 z-50 max-h-64 overflow-y-auto rounded-xl border border-[#36384d] bg-[#181925] p-1.5 shadow-2xl">
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#656d86]">
                  {inputTrigger?.[1] === "/" ? "MiMo commands" : inputTrigger?.[1] === "#" ? "Application Skills" : inputTrigger?.[1] === "$" ? "Subagents" : "Tệp và thư mục dự án"}
                </div>
                {inputSuggestions.map((suggestion, index) => {
                  const Icon = suggestion.kind === "command" ? Command : suggestion.kind === "skill" ? Hash : suggestion.kind === "subagent" ? Bot : AtSign;
                  return (
                    <button
                      key={`${suggestion.kind}-${suggestion.value}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyInputSuggestion(suggestion)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${index === suggestionIndex ? "bg-mimoorange-soft" : "hover:bg-[#242638]"}`}
                    >
                      <Icon size={14} className={index === suggestionIndex ? "text-mimoorange" : "text-[#747c96]"} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium text-[#e8eaf2]">{suggestion.label}</span>
                        <span className="block truncate text-[10px] text-[#737b94]">{suggestion.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                agentMode === "agent"
                  ? "Mô tả tác vụ cho Agent (vd: phân tích dự án, tạo file...)"
                  : status === "connected"
                  ? "Nhắn tin..."
                  : status === "connecting"
                  ? "Đang kết nối..."
                  : "Chưa kết nối. Mở Settings để kết nối MiMo."
              }
              rows={1}
              className="w-full bg-transparent text-sm text-[#eef0f6] placeholder-[#71778f] resize-none outline-none px-6 pt-3.5 max-h-[160px]"
            />

            {/* Tool buttons row */}
            <div className="flex items-center px-2 pb-2 gap-0.5" ref={menuRef}>
              {QUICK_TOOLS.map((tool, i) => (
                <div key={i} className="relative group">
                  <button
                    onClick={() => handleToolAction(tool.action)}
                    disabled={status !== "connected"}
                    title={tool.label}
                    className={`flex items-center px-1.5 py-1 rounded-lg transition-colors disabled:opacity-40 ${
                      activeMenu === tool.action
                        ? "text-mimoorange bg-mimoorange-soft"
                        : "text-[#9aa4b2] hover:text-[#e6e9ef] hover:bg-[#20262f]"
                    }`}
                  >
                    <tool.icon size={16} />
                    {["write", "translate", "homework", "srt", "agent"].includes(tool.action) && (
                      <ChevronDown size={10} className={`ml-0.5 transition-transform ${activeMenu === tool.action ? "rotate-180" : ""}`} />
                    )}
                  </button>
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-[#1a1f2b] border border-[#2f3848] text-[#e6e9ef] text-[10px] rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-panel">
                    {tool.label}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#2f3848]" />
                  </div>
                </div>
              ))}

              {/* Tool dropdown menus */}
              {renderToolMenu()}

              <div className="ml-auto flex items-center gap-1">
                {chatInput.trim() && (
                  <span className="text-[10px] text-[#5f6b7a] mr-1">
                    {chatInput.trim().length}
                  </span>
                )}

                {/* Send button */}
                <button
                  onClick={send}
                  disabled={!chatInput.trim() || isGenerating || (status !== "connected" && !canRunLocally)}
                  className={`uaget-send p-2.5 rounded-full transition-all ${
                    isGenerating
                      ? "bg-[#20262f] text-[#5f6b7a]"
                      : chatInput.trim()
                      ? "btn-accent"
                      : "bg-[#20262f] text-[#5f6b7a]"
                  }`}
                >
                  {isGenerating ? (
                    <span className="inline-block w-[18px] h-[18px] border-2 border-[#5f6b7a] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <ArrowUp size={18} />
                  )}
                </button>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-[#5f6b7a] text-center mt-1.5">
            LvAIgent có thể mắc lỗi. Hãy kiểm tra thông tin quan trọng. Shift+Enter
            để xuống dòng.
          </p>
        </div>
      </div>
    </div>
  );
}
