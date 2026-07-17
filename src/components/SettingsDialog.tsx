import { useState, useEffect, useRef } from "react";
import {
  X,
  Save,
  Cpu,
  Volume2,
  Loader,
  CheckCircle,
  XCircle,
  RefreshCw,
  ExternalLink,
  FolderOpen,
  Trash2,
  Rocket,
  Settings,
  Wifi,
  ChevronDown,
  Bot,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store";

interface Props {
  onClose: () => void;
  onCheckUpdate?: () => void;
}

interface LogEntry {
  time: string;
  msg: string;
  type: "info" | "success" | "error" | "wait";
}

type TabKey = "general" | "models" | "providers" | "voice" | "connect";

export default function SettingsDialog({ onClose, onCheckUpdate }: Props) {
  const { settings, updateSettings, status, setStatus, models, setModels } =
    useStore();
  const [tab, setTab] = useState<TabKey>("general");
  const [selectedModel, setSelectedModel] = useState(
    settings.selectedModel || "mimo/mimo-auto"
  );
  const [voiceLang, setVoiceLang] = useState(settings.voiceLang || "vi-VN");
  const [voiceModel, setVoiceModel] = useState(settings.voiceModel || "");
  const [mimoPath, setMimoPath] = useState(settings.mimoPath || "");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(status === "connected");
  const logEndRef = useRef<HTMLDivElement>(null);

  // General settings
  const [language, setLanguage] = useState(settings.language || "vi");
  const [autoAcceptPermissions, setAutoAcceptPermissions] = useState(
    settings.autoAcceptPermissions ?? true
  );
  const [terminalShell, setTerminalShell] = useState(
    settings.terminalShell || "auto"
  );
  const [showReasoning, setShowReasoning] = useState(
    settings.showReasoning ?? true
  );
  const [expandShellContextTools, setExpandShellContextTools] = useState(
    settings.expandShellContextTools ?? false
  );
  const [expandEditTools, setExpandEditTools] = useState(
    settings.expandEditTools ?? false
  );
  const [autoSave, setAutoSave] = useState(settings.autoSave ?? true);

  // Agent settings
  const [agentAccessLevel, setAgentAccessLevel] = useState(
    settings.agent?.accessLevel || "full-access"
  );
  const [agentSystemPromptsPath, setAgentSystemPromptsPath] = useState(
    settings.agent?.systemPromptsPath || "/session/prompt/"
  );
  const [agentStoragePath, setAgentStoragePath] = useState(
    settings.agent?.storagePath || ""
  );
  const [autoReadAgentsMd, setAutoReadAgentsMd] = useState(
    settings.agent?.autoReadAgentsMd ?? true
  );
  const [enableAgenticLoop, setEnableAgenticLoop] = useState(
    settings.agent?.enableAgenticLoop ?? true
  );
  const [agentMaxIterations, setAgentMaxIterations] = useState(
    settings.agent?.maxIterations || 25
  );

  // Load saved mimo path on mount
  useEffect(() => {
    (async () => {
      try {
        const p = await invoke<string | null>("get_mimo_path");
        if (p) setMimoPath(p);
      } catch {}
    })();
  }, []);

  const addLog = (msg: string, type: LogEntry["type"] = "info") => {
    const now = new Date();
    const time = now.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLogs((prev) => [...prev, { time, msg, type }]);
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const doConnect = async () => {
    setConnecting(true);
    setConnected(false);
    setLogs([]);
    addLog("Bắt đầu kết nối với MiMo...", "info");

    updateSettings({
      selectedModel,
      voiceLang,
      voiceModel,
      mimoPath,
      language,
      autoAcceptPermissions,
      terminalShell,
      showReasoning,
      expandShellContextTools,
      expandEditTools,
      autoSave,
      agent: {
        accessLevel: agentAccessLevel,
        systemPromptsPath: agentSystemPromptsPath,
        storagePath: agentStoragePath,
        autoReadAgentsMd,
        enableAgenticLoop,
        maxIterations: agentMaxIterations,
      },
    });
    addLog("Đã lưu cấu hình", "success");

    try {
      setStatus("connecting");

      if (mimoPath) {
        addLog("Sử dụng đường dẫn MiMo đã nhập...", "info");
        await invoke("set_mimo_path", { path: mimoPath });
      }

      addLog("Khởi động MiMo CLI...", "wait");
      await invoke("start_mimo");
      addLog("MiMo CLI đã khởi động", "success");

      addLog("Đang tải danh sách models...", "wait");
      try {
        const m = await invoke<{
          model_id: string;
          model_name: string;
          display_name: string;
          description: string;
          is_available: boolean;
        }[]>("list_mimo_models");
        setModels(m);
        addLog(`Tìm thấy ${m.length} models`, "success");
      } catch (e) {
        addLog(`Không thể tải models: ${e}`, "error");
      }

      addLog("MiMo đã sẵn sàng!", "success");
      setConnected(true);
      setConnecting(false);
      setStatus("connected");
    } catch (e) {
      const msg = String(e);
      addLog(`Lỗi: ${msg}`, "error");
      if (msg.includes("not found") || msg.includes("checked")) {
        addLog(
          "Nhấn 'Kiểm tra đường dẫn' để xem các vị trí đã tìm.",
          "info"
        );
      }
      addLog("Hãy đảm bảo MiMo Code CLI đã được cài đặt.", "error");
      setConnecting(false);
      setStatus("error");
    }
  };

  const handleRetry = () => {
    setConnecting(false);
    setConnected(false);
    setStatus("disconnected");
    doConnect();
  };

  const handleSave = () => {
    updateSettings({
      selectedModel,
      voiceLang,
      voiceModel,
      mimoPath,
      language,
      autoAcceptPermissions,
      terminalShell,
      showReasoning,
      expandShellContextTools,
      expandEditTools,
      autoSave,
      agent: {
        accessLevel: agentAccessLevel,
        systemPromptsPath: agentSystemPromptsPath,
        storagePath: agentStoragePath,
        autoReadAgentsMd,
        enableAgenticLoop,
        maxIterations: agentMaxIterations,
      },
    });
    addLog("Đã lưu cấu hình", "success");
  };

  const tabs: { key: TabKey; label: string; icon: typeof Settings }[] = [
    { key: "general", label: "General", icon: Settings },
    { key: "models", label: "Model", icon: Cpu },
    { key: "providers", label: "Nhà cung cấp", icon: Wifi },
    { key: "voice", label: "Giọng nói", icon: Volume2 },
    { key: "connect", label: "Kết nối", icon: RefreshCw },
  ];

  const Toggle = ({
    checked,
    onChange,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors ${
        checked ? "bg-mimoorange" : "bg-[#2f3848]"
      }`}
    >
      <span
        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
          checked ? "translate-x-4" : ""
        }`}
      />
    </button>
  );

  const Select = ({
    value,
    onChange,
    options,
    disabled,
  }: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    disabled?: boolean;
  }) => (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full appearance-none bg-[#0b0d12] border border-[#2f3848] rounded-lg px-3 py-2 pr-8 text-sm text-[#c4ccd8] focus:outline-none focus:border-mimoorange disabled:opacity-60"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#5f6b7a] pointer-events-none"
      />
    </div>
  );

  const SettingRow = ({
    label,
    description,
    children,
  }: {
    label: string;
    description?: string;
    children: React.ReactNode;
  }) => (
    <div className="flex items-center justify-between py-3 border-b border-[#232a36] last:border-0">
      <div className="flex-1 mr-4">
        <p className="text-sm font-medium text-[#e6e9ef]">{label}</p>
        {description && (
          <p className="text-xs text-[#5f6b7a] mt-0.5">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-[#101319] border border-[#2f3848] rounded-xl w-[680px] shadow-xl flex flex-col animate-scale-in">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-[#e6e9ef]">Cài đặt</h2>
            <p className="text-xs text-[#5f6b7a] mt-0.5">
              Kết nối và cấu hình nhà cung cấp
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#5f6b7a] hover:text-[#9aa4b2] rounded-lg hover:bg-[#1a1f2b] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex h-[440px]">
          {/* Left Sidebar */}
          <div className="w-48 border-r border-[#232a36] py-2 px-2 shrink-0">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                disabled={connecting}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  tab === t.key
                    ? "bg-[#1a1f2b] text-mimoorange font-medium"
                    : "text-[#9aa4b2] hover:bg-[#151922] hover:text-[#c4ccd8]"
                } ${connecting ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <t.icon size={16} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-hide px-6">
            {tab === "general" && (
              <div className="py-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-[#e6e9ef]">
                    General
                  </h3>
                  <button
                    onClick={() => setAutoSave(!autoSave)}
                    className="text-xs text-[#5f6b7a] hover:text-[#9aa4b2]"
                  >
                    Tự động lưu
                  </button>
                </div>

                <div className="bg-[#0b0d12] rounded-xl border border-[#232a36] divide-y divide-[#232a36]">
                  <SettingRow
                    label="Ngôn ngữ"
                    description="Ngôn ngữ hiển thị giao diện"
                  >
                    <Select
                      value={language}
                      onChange={setLanguage}
                      options={[
                        { value: "vi", label: "Tiếng Việt" },
                        { value: "en", label: "English" },
                        { value: "ja", label: "日本語" },
                        { value: "ko", label: "한국어" },
                        { value: "zh", label: "中文" },
                      ]}
                      disabled={connecting}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Tự chấp nhận quyền"
                    description="Tự động phê duyệt yêu cầu quyền / file dialog từ Agent"
                  >
                    <Toggle
                      checked={autoAcceptPermissions}
                      onChange={setAutoAcceptPermissions}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Terminal Shell"
                    description="Shell cho terminal và tool call của Agent"
                  >
                    <Select
                      value={terminalShell}
                      onChange={setTerminalShell}
                      options={[
                        { value: "auto", label: "Auto (Mặc định)" },
                        { value: "powershell", label: "PowerShell" },
                        { value: "cmd", label: "Command Prompt" },
                        { value: "bash", label: "Bash" },
                      ]}
                      disabled={connecting}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Hiện reasoning"
                    description="Hiển thị panel REASONING trong tin nhắn assistant"
                  >
                    <Toggle
                      checked={showReasoning}
                      onChange={setShowReasoning}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Mở rộng shell / context tools"
                    description="Mặc định mở panel Context Gathering (reads/searches)"
                  >
                    <Toggle
                      checked={expandShellContextTools}
                      onChange={setExpandShellContextTools}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Mở rộng edit tools"
                    description="Mặc định mở panel File Changes (writes/edits)"
                  >
                    <Toggle
                      checked={expandEditTools}
                      onChange={setExpandEditTools}
                    />
                  </SettingRow>
                </div>

              <h3 className="text-base font-semibold text-[#e6e9ef] mt-6 mb-4">
                Agent
              </h3>
              <div className="bg-[#0b0d12] rounded-xl border border-[#232a36] divide-y divide-[#232a36]">
                <SettingRow
                  label="Mức truy cập"
                  description="Full-access: Agent có toàn quyền sửa code, tạo file, chạy lệnh"
                >
                    <Select
                    value={agentAccessLevel}
                    onChange={(v) => setAgentAccessLevel(v as any)}
                    options={[
                      { value: "full-access", label: "Full Access (Mặc định)" },
                      { value: "read-only", label: "Read Only" },
                      { value: "sandbox", label: "Sandbox" },
                    ]}
                    disabled={connecting}
                  />
                </SettingRow>

                <SettingRow
                  label="Agentic Loop"
                  description="Vòng lặp Observation → Thought → Tool → Action tự động"
                >
                  <Toggle
                    checked={enableAgenticLoop}
                    onChange={setEnableAgenticLoop}
                  />
                </SettingRow>

                <SettingRow
                  label="Tự đọc AGENTS.md"
                  description="Tự động nạp luật dự án từ tệp AGENTS.md ở thư mục gốc"
                >
                  <Toggle
                    checked={autoReadAgentsMd}
                    onChange={setAutoReadAgentsMd}
                  />
                </SettingRow>

                <div className="p-4">
                  <label className="block text-xs font-medium text-[#9aa4b2] mb-1.5">
                    Đường dẫn System Prompts
                  </label>
                  <input
                    value={agentSystemPromptsPath}
                    onChange={(e) => setAgentSystemPromptsPath(e.target.value)}
                    disabled={connecting}
                    className="w-full bg-[#101319] border border-[#2f3848] rounded-lg px-3 py-2 text-sm text-[#c4ccd8] placeholder-[#5f6b7a] focus:outline-none focus:border-mimoorange disabled:opacity-60"
                    placeholder="/session/prompt/"
                  />
                  <p className="text-[11px] text-[#5f6b7a] mt-1">
                    Thư mục chứa file system prompt dạng .md (vd: /session/prompt/)
                  </p>
                </div>

                <div className="p-4">
                  <label className="block text-xs font-medium text-[#9aa4b2] mb-1.5">
                    Đường dẫn lưu trữ cục bộ
                  </label>
                  <input
                    value={agentStoragePath}
                    onChange={(e) => setAgentStoragePath(e.target.value)}
                    disabled={connecting}
                    className="w-full bg-[#101319] border border-[#2f3848] rounded-lg px-3 py-2 text-sm text-[#c4ccd8] placeholder-[#5f6b7a] focus:outline-none focus:border-mimoorange disabled:opacity-60"
                    placeholder="Để trống để dùng mặc định"
                  />
                  <p className="text-[11px] text-[#5f6b7a] mt-1">
                    Thư mục chứa session, log và cấu hình Agent trên máy cá nhân
                  </p>
                </div>

                <div className="p-4">
                  <label className="block text-xs font-medium text-[#9aa4b2] mb-1.5">
                    Số vòng lặp tối đa
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={agentMaxIterations}
                    onChange={(e) => setAgentMaxIterations(Number(e.target.value))}
                    disabled={connecting}
                    className="w-24 bg-[#101319] border border-[#2f3848] rounded-lg px-3 py-2 text-sm text-[#c4ccd8] focus:outline-none focus:border-mimoorange disabled:opacity-60"
                  />
                  <p className="text-[11px] text-[#5f6b7a] mt-1">
                    Số bước tối đa trong Agentic Loop (mặc định: 25)
                  </p>
                </div>
              </div>
            </div>
            )}

            {tab === "models" && (
              <div className="py-4">
                <h3 className="text-base font-semibold text-[#e6e9ef] mb-4">
                  Model
                </h3>
                <div className="bg-[#0b0d12] rounded-xl border border-[#232a36] p-4">
                  <label className="block text-xs font-medium text-[#9aa4b2] mb-2">
                    Model chính
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={connecting}
                    className="w-full bg-[#101319] border border-[#2f3848] rounded-lg px-3 py-2 text-sm text-[#c4ccd8] focus:outline-none focus:border-mimoorange disabled:opacity-60"
                  >
                    {models.length > 0 ? (
                      models.map((m) => (
                        <option key={m.model_id} value={m.model_id}>
                          {m.display_name} ({m.model_id})
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="mimo/mimo-auto">mimo/mimo-auto</option>
                        <option value="xiaomi/mimo-v2-flash">
                          xiaomi/mimo-v2-flash
                        </option>
                        <option value="xiaomi/mimo-v2-omni">
                          xiaomi/mimo-v2-omni
                        </option>
                        <option value="xiaomi/mimo-v2-pro">
                          xiaomi/mimo-v2-pro
                        </option>
                        <option value="xiaomi/mimo-v2.5">
                          xiaomi/mimo-v2.5
                        </option>
                        <option value="xiaomi/mimo-v2.5-pro">
                          xiaomi/mimo-v2.5-pro
                        </option>
                        <option value="xiaomi/mimo-v2.5-pro-ultraspeed">
                          xiaomi/mimo-v2.5-pro-ultraspeed
                        </option>
                      </>
                    )}
                  </select>
                  <p className="text-[11px] text-[#5f6b7a] mt-2">
                    Chọn model để sử dụng. Models được tự động phát hiện khi
                    kết nối.
                  </p>
                </div>
              </div>
            )}

            {tab === "providers" && (
              <div className="py-4">
                <h3 className="text-base font-semibold text-[#e6e9ef] mb-4">
                  Nhà cung cấp
                </h3>
                <div className="bg-[#0b0d12] rounded-xl border border-[#232a36] p-4">
                  <p className="text-sm text-[#9aa4b2]">
                    Quản lý các nhà cung cấp API và cấu hình kết nối.
                  </p>
                  <p className="text-xs text-[#5f6b7a] mt-2">
                    Tính năng đang được phát triển.
                  </p>
                </div>
              </div>
            )}

            {tab === "voice" && (
              <div className="py-4">
                <h3 className="text-base font-semibold text-[#e6e9ef] mb-4">
                  Giọng nói
                </h3>
                <div className="bg-[#0b0d12] rounded-xl border border-[#232a36] divide-y divide-[#232a36]">
                  <SettingRow
                    label="Ngôn ngữ giọng nói"
                    description="Chọn ngôn ngữ cho giọng đọc"
                  >
                    <Select
                      value={voiceLang}
                      onChange={setVoiceLang}
                      options={[
                        { value: "vi-VN", label: "Tiếng Việt (vi-VN)" },
                        { value: "en-US", label: "English (en-US)" },
                        { value: "en-GB", label: "English UK (en-GB)" },
                        { value: "ja-JP", label: "日本語 (ja-JP)" },
                        { value: "ko-KR", label: "한국어 (ko-KR)" },
                        { value: "zh-CN", label: "中文 (zh-CN)" },
                      ]}
                      disabled={connecting}
                    />
                  </SettingRow>

                  <div className="p-4">
                    <label className="block text-sm font-medium text-[#e6e9ef] mb-1">
                      Model giọng nói
                    </label>
                    <input
                      value={voiceModel}
                      onChange={(e) => setVoiceModel(e.target.value)}
                      disabled={connecting}
                      className="w-full bg-[#101319] border border-[#2f3848] rounded-lg px-3 py-2 text-sm text-[#c4ccd8] placeholder-[#5f6b7a] focus:outline-none focus:border-mimoorange disabled:opacity-60"
                      placeholder="Để trống để dùng giọng mặc định"
                    />
                    <p className="text-[11px] text-[#5f6b7a] mt-1">
                      Nhập tên giọng đọc cụ thể
                    </p>
                  </div>
                </div>
              </div>
            )}

            {tab === "connect" && (
              <div className="py-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-[#e6e9ef]">
                    Kết nối
                  </h3>
                  <div className="text-xs">
                    {connected ? (
                      <span className="text-green-400 flex items-center gap-1.5">
                        <CheckCircle size={14} />
                        Đã kết nối
                      </span>
                    ) : connecting ? (
                      <span className="text-yellow-400 flex items-center gap-1.5">
                        <Loader size={14} className="animate-spin" />
                        Đang kết nối...
                      </span>
                    ) : (
                      <span className="text-[#5f6b7a]">Chưa kết nối</span>
                    )}
                  </div>
                </div>
                <div className="bg-[#0b0d12] rounded-xl border border-[#232a36] p-4 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[#9aa4b2] mb-1.5">
                      File MiMo CLI (mimo.exe)
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={async () => {
                          try {
                            const selected = await open({
                              multiple: false,
                              filters: [
                                { name: "MiMo CLI", extensions: ["exe"] },
                              ],
                              title: "Chọn file mimo.exe",
                            });
                            if (selected) {
                              setMimoPath(selected);
                              addLog(`Đã chọn: ${selected}`, "success");
                            }
                          } catch (e) {
                            addLog(`Lỗi chọn file: ${e}`, "error");
                          }
                        }}
                        disabled={connecting}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs bg-mimoorange/10 hover:bg-mimoorange/20 text-mimoorange rounded-lg transition-colors font-medium disabled:opacity-50"
                      >
                        <FolderOpen size={14} />
                        Chọn file mimo.exe
                      </button>
                      {mimoPath && (
                        <button
                          onClick={() => {
                            setMimoPath("");
                            invoke("reset_mimo_path").catch(() => {});
                            addLog("Đã xóa đường dẫn MiMo", "info");
                          }}
                          disabled={connecting}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                          Xóa
                        </button>
                      )}
                    </div>
                    {mimoPath ? (
                      <p className="mt-1.5 text-[11px] text-green-400 break-all">
                        {mimoPath}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-[11px] text-[#5f6b7a]">
                        Chưa chọn. Ứng dụng sẽ tự động tìm mimo.exe trong thư
                        mục cài đặt, thư mục hiện tại hoặc trong PATH.
                      </p>
                    )}
                  </div>

                  <div>
                    <button
                      onClick={async () => {
                        addLog("Đang kiểm tra đường dẫn...", "wait");
                        try {
                          const info = await invoke<string>("check_mimo_paths");
                          addLog(`Kết quả kiểm tra:\n${info}`, "info");
                        } catch (e) {
                          addLog(`Lỗi kiểm tra: ${e}`, "error");
                        }
                      }}
                      disabled={connecting}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg transition-colors font-medium disabled:opacity-50"
                    >
                      <FolderOpen size={14} />
                      Kiểm tra đường dẫn
                    </button>
                  </div>

                  <div className="p-3 bg-mimoorange/5 border border-mimoorange/20 rounded-lg">
                    <p className="text-xs font-medium text-mimoorange mb-1">
                      Chưa cài đặt MiMo CLI?
                    </p>
                    <p className="text-[11px] text-[#9aa4b2] mb-2">
                      Tải xuống và cài đặt MiMo Code CLI từ GitHub, sau đó
                      chọn file mimo.exe ở trên.
                    </p>
                    <a
                      href="https://github.com/XiaomiMiMo/MiMo-Code/releases"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-mimoorange hover:underline"
                    >
                      <ExternalLink size={12} />
                      https://github.com/XiaomiMiMo/MiMo-Code/releases
                    </a>
                  </div>

                  <div className="p-3 bg-[#151922] border border-[#232a36] rounded-lg">
                    <p className="text-xs font-medium text-[#c4ccd8] mb-1">
                      Hướng dẫn kết nối
                    </p>
                    <ol className="text-[11px] text-[#9aa4b2] space-y-1 list-decimal list-inside">
                      <li>Tải MiMo Code CLI từ link trên</li>
                      <li>Giải nén và chạy file cài đặt</li>
                      <li>
                        Nhấn "Chọn file mimo.exe" và chọn đường dẫn đến file
                        mimo.exe
                      </li>
                      <li>Nhấn "Kết nối" để bắt đầu</li>
                    </ol>
                  </div>
                </div>

                {/* Connection Logs */}
                {logs.length > 0 && (
                  <div className="mt-4 p-3 bg-[#0b0d12] rounded-xl border border-[#232a36] max-h-[180px] overflow-y-auto scrollbar-hide">
                    <p className="text-[10px] font-semibold text-[#9aa4b2] uppercase mb-2">
                      Log kết nối
                    </p>
                    <div className="space-y-1">
                      {logs.map((log, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-1.5 text-[11px]"
                        >
                          <span className="text-[#5f6b7a] shrink-0 w-14">
                            {log.time}
                          </span>
                          {log.type === "success" && (
                            <CheckCircle
                              size={12}
                              className="text-green-500 mt-0.5 shrink-0"
                            />
                          )}
                          {log.type === "error" && (
                            <XCircle
                              size={12}
                              className="text-red-400 mt-0.5 shrink-0"
                            />
                          )}
                          {log.type === "wait" && (
                            <Loader
                              size={12}
                              className="text-yellow-500 mt-0.5 animate-spin shrink-0"
                            />
                          )}
                          {log.type === "info" && (
                            <span className="w-3 shrink-0" />
                          )}
                          <span
                            className={
                              log.type === "success"
                                ? "text-green-400"
                                : log.type === "error"
                                ? "text-red-400"
                                : log.type === "wait"
                                ? "text-yellow-400"
                                : "text-[#9aa4b2]"
                            }
                          >
                            {log.msg}
                          </span>
                        </div>
                      ))}
                      <div ref={logEndRef} />
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#232a36] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#cfd6e4] to-mimoorange flex items-center justify-center">
              <Bot size={10} className="text-[#0b0d12]" />
            </div>
            <span className="text-[10px] text-[#5f6b7a]">MiMo v1.0.0</span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCheckUpdate}
              className="p-2 text-[#5f6b7a] hover:text-[#9aa4b2] rounded-lg hover:bg-[#1a1f2b] transition-colors"
              title="Kiểm tra phiên bản mới"
            >
              <Rocket size={16} />
            </button>
            <button
              onClick={onClose}
              disabled={connecting}
              className="px-4 py-2 text-sm bg-[#1a1f2b] hover:bg-[#232a36] text-[#9aa4b2] rounded-lg transition-colors disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              disabled={connecting}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[#1a1f2b] hover:bg-[#232a36] text-[#e6e9ef] rounded-lg transition-colors font-medium disabled:opacity-50"
            >
              <Save size={14} />
              Lưu
            </button>
            {!connected ? (
              <button
                onClick={doConnect}
                disabled={connecting}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-mimoorange hover:bg-mimoorange-600 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
              >
                {connecting ? (
                  <>
                    <Loader size={14} className="animate-spin" />
                    Đang kết nối...
                  </>
                ) : (
                  "Kết nối"
                )}
              </button>
            ) : (
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-mimoorange hover:bg-mimoorange-600 text-white rounded-lg transition-colors font-medium"
              >
                Vào cuộc trò chuyện →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
