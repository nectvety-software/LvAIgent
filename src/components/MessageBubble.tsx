import { isValidElement, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ComponentPropsWithoutRef } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Code,
  Copy,
  FileText,
  LoaderCircle,
  RotateCcw,
  SquarePlus,
  Type,
  Volume2,
  FileCode2,
} from "lucide-react";
import type { Message, TaskItem } from "../types";
import {
  copyToClipboard,
  exportAsDoc,
  findBestVoice,
  formatTimestamp,
  stripMarkdown,
} from "../utils";
import { useStore } from "../store";
import CodeContextMenu from "./CodeContextMenu";

function getTextFromNode(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getTextFromNode).join("");
  if (node && typeof node === "object" && "props" in (node as object)) {
    return getTextFromNode((node as { props?: { children?: unknown } }).props?.children);
  }
  return "";
}

function CodeBlock({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = getTextFromNode(children);
    if (!text) return;
    await copyToClipboard(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const codeNode = Array.isArray(children) ? children[0] : children;
  const className = isValidElement<{ className?: string }>(codeNode) ? codeNode.props.className || "" : "";
  const language = className.match(/language-([\w-]+)/)?.[1]?.toUpperCase() || "CODE";
  const codeText = getTextFromNode(children);

  return (
    <CodeContextMenu text={codeText} className="group relative my-4 overflow-hidden rounded-xl border border-[#34364b] bg-[#10111a] shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div className="flex h-9 items-center justify-between border-b border-[#303246] bg-[#191a27] px-3">
        <span className="flex items-center gap-1.5 font-mono text-[10px] font-medium tracking-wide text-[#858ca4]"><FileCode2 size={12} />{language}</span>
        <button
          onClick={handleCopy}
          className="rounded-md p-1.5 text-[#858ca4] transition-colors hover:bg-[#292b3c] hover:text-white"
          title="Sao chép mã"
        >
          {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
        </button>
      </div>
      <pre
        {...props}
        className="code-scroll m-0 max-h-[460px] overflow-auto border-0 bg-[#10111a] p-4 font-mono text-[12px] leading-6 text-[#d3d7e3]"
      >
        {children}
      </pre>
    </CodeContextMenu>
  );
}

interface FileChangeSummary {
  path: string;
  additions: number;
  deletions: number;
}

function cleanFilePath(value: string): string {
  return value
    .trim()
    .replace(/^['"`]+|['"`,;]+$/g, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");
}

function extractFileChanges(tasks: TaskItem[]): FileChangeSummary[] {
  const changes = new Map<string, FileChangeSummary>();
  const addPath = (rawPath: string) => {
    const path = cleanFilePath(rawPath);
    if (!path || !/[./\\]/.test(path) || path.length > 260) return null;
    if (!changes.has(path)) changes.set(path, { path, additions: 0, deletions: 0 });
    return changes.get(path)!;
  };

  for (const task of tasks) {
    const text = task.detail || "";
    if (!text) continue;
    let current: FileChangeSummary | null = null;

    for (const line of text.split(/\r?\n/)) {
      const marker = line.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s*(.+)$/i)
        || line.match(/^\+\+\+\s+(?:[ab]\/)?(.+)$/)
        || line.match(/^---\s+(?:[ab]\/)?(.+)$/);
      if (marker) {
        current = addPath(marker[1]);
        continue;
      }
      if (current && line.startsWith("+") && !line.startsWith("+++")) current.additions += 1;
      if (current && line.startsWith("-") && !line.startsWith("---")) current.deletions += 1;
    }

    const keyedPaths = text.matchAll(
      /["']?(?:file_path|filepath|file|path|filename)["']?\s*[:=]\s*["']([^"'\r\n]+)["']/gi
    );
    for (const match of keyedPaths) addPath(match[1]);

    const inlinePaths = text.matchAll(
      /(?:[A-Za-z]:[\\/])?(?:[\w@. -]+[\\/])+[\w@. -]+\.[A-Za-z0-9]{1,10}/g
    );
    for (const match of inlinePaths) addPath(match[0]);
  }

  return [...changes.values()];
}

function TaskSummary({ tasks }: { tasks: TaskItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const fileChanges = extractFileChanges(tasks);
  const running = tasks.filter((task) => task.status === "running").length;
  const failed = tasks.filter((task) => task.status === "error").length;
  const visibleChanges = expanded ? fileChanges : fileChanges.slice(0, 4);
  const additions = fileChanges.reduce((sum, file) => sum + file.additions, 0);
  const deletions = fileChanges.reduce((sum, file) => sum + file.deletions, 0);
  const remaining = fileChanges.length - visibleChanges.length;

  if (fileChanges.length === 0) {
    return (
      <section className="lvaigent-change-card mt-6 flex items-center gap-3 rounded-xl border px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#14141f] text-[#aeb4c7]">
          {running > 0 ? <LoaderCircle size={18} className="animate-spin text-sky-400" /> : <SquarePlus size={18} />}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[#edf0f7]">
            {running > 0 ? "Đang xử lý thay đổi" : `Đã hoàn tất ${tasks.length} thao tác`}
          </div>
          <div className="mt-0.5 text-[11px] text-[#777e97]">
            {failed > 0 ? `${failed} thao tác gặp lỗi` : "Các thao tác kỹ thuật đã được thu gọn"}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="lvaigent-change-card mt-6 overflow-hidden rounded-xl border">
      <div className="flex items-center gap-3 border-b border-[#303047] px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#14141f] text-[#aeb4c7]">
          <SquarePlus size={18} />
        </div>
        <div>
          <div className="text-[13px] font-semibold text-[#edf0f7]">
            Edited {fileChanges.length} {fileChanges.length === 1 ? "file" : "files"}
          </div>
          <div className="mt-0.5 text-[11px]">
            <span className="text-emerald-400">+{additions}</span>
            <span className="mx-1 text-[#626981]">·</span>
            <span className="text-rose-400">-{deletions}</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            disabled
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] text-[#8d93a8] opacity-60"
            title="Hoàn tác sẽ được hỗ trợ trong bản tiếp theo"
          >
            Undo <RotateCcw size={13} />
          </button>
          <button
            onClick={() => setExpanded(true)}
            className="rounded-lg border border-[#3b3b4c] bg-[#292936] px-3 py-1.5 text-[11px] text-[#e7e9ef] transition-colors hover:bg-[#343443]"
          >
            Review
          </button>
        </div>
      </div>

      <div>
        {visibleChanges.map((file) => (
          <div key={file.path} className="flex min-h-10 items-center gap-3 px-4 py-2.5 text-[12px]">
            <div className="min-w-0 flex-1 truncate text-[#c7cad5]">
              {file.path.includes("/") ? (
                <>
                  <span className="text-[#8c92a6]">{file.path.slice(0, file.path.lastIndexOf("/") + 1)}</span>
                  <span className="text-[#eceef4]">{file.path.slice(file.path.lastIndexOf("/") + 1)}</span>
                </>
              ) : (
                <span className="text-[#eceef4]">{file.path}</span>
              )}
            </div>
            <div className="shrink-0 font-mono text-[11px]">
              <span className="text-emerald-400">+{file.additions}</span>
              <span className="mx-1 text-[#626981]">·</span>
              <span className="text-rose-400">-{file.deletions}</span>
            </div>
          </div>
        ))}
      </div>

      {fileChanges.length > 4 && (
        <button
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-[#303047] px-4 py-2.5 text-[11px] text-[#969db3] transition-colors hover:bg-[#24243a] hover:text-white"
        >
          {expanded ? "Thu gọn" : `Hiện thêm ${remaining} tệp`}
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      )}
    </section>
  );
}

export default function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";
  const [renderMarkdown, setRenderMarkdown] = useState(true);
  const [showThoughts, setShowThoughts] = useState(false);
  const [copied, setCopied] = useState(false);
  const isGenerating = useStore((state) => state.isGenerating);
  const latestAssistantId = useStore((state) => [...state.messages].reverse().find((message) => message.role === "assistant")?.id);

  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-[11px] text-red-400">
          {msg.content}
        </span>
      </div>
    );
  }

  const handleCopy = async () => {
    const ok = await copyToClipboard(msg.content);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleListen = () => {
    if (!("speechSynthesis" in window)) return;
    const store = useStore.getState();
    const queue = store.messages
      .filter((message) => message.role === "assistant" && message.content)
      .map((message) => ({ title: "Cuộc trò chuyện", content: message.content }));
    const index = queue.findIndex((item) => item.content === msg.content);
    const startIndex = index >= 0 ? index : queue.length - 1;

    store.setPipQueue(queue);
    store.setPipIndex(startIndex);
    store.setPipTitle("Cuộc trò chuyện");
    store.setPipSubtitle(msg.content.slice(0, 80) + (msg.content.length > 80 ? "..." : ""));
    store.setPipProgress(0);
    store.setPipVisible(true);
    store.setPipPlaying(true);

    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(msg.content);
    const lang = store.settings.voiceLang || "vi-VN";
    utterance.lang = lang;
    utterance.rate = 1;
    const bestVoice = findBestVoice(lang, store.settings.voiceModel);
    if (bestVoice) utterance.voice = bestVoice;
    utterance.onstart = () => store.setPipPlaying(true);
    utterance.onend = () => {
      store.setPipPlaying(false);
      store.setPipProgress(100);
    };
    utterance.onerror = () => store.setPipPlaying(false);
    speechSynthesis.speak(utterance);

    const startedAt = Date.now();
    const estimatedDuration = Math.max(1, msg.content.length / 15) * 1000;
    const interval = window.setInterval(() => {
      const currentStore = useStore.getState();
      if (!currentStore.pipPlaying) {
        window.clearInterval(interval);
        return;
      }
      const progress = Math.min(100, ((Date.now() - startedAt) / estimatedDuration) * 100);
      currentStore.setPipProgress(progress);
      if (progress >= 100) window.clearInterval(interval);
    }, 200);
  };

  if (isUser) {
    return (
      <div className="uaget-message mb-6 flex justify-end animate-slide-up">
        <div className="uaget-user-message max-w-[72%] rounded-[14px] px-4 py-3 text-[14px] leading-6 text-white">
          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        </div>
      </div>
    );
  }

  const hasThoughts = Boolean(msg.thoughts);
  const isStillGenerating = isAssistantStillGenerating(msg);

  return (
    <article className="uaget-message lvaigent-assistant-document mx-auto mb-9 w-full max-w-[900px] animate-slide-up">
      {hasThoughts && (
        <div className="mb-4">
          <button
            onClick={() => setShowThoughts((value) => !value)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-mimoorange transition-colors hover:text-orange-300"
          >
            <Brain size={12} className={isStillGenerating && !showThoughts ? "animate-pulse" : ""} />
            <span>Suy nghĩ</span>
            <span className="font-normal text-[#686f88]">({msg.thoughts!.length} ký tự)</span>
            {showThoughts ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          {showThoughts && (
            <div className="chat-scroll mt-2 max-h-52 overflow-y-auto rounded-lg border border-mimoorange/20 bg-mimoorange-soft p-3 text-xs text-[#a3a9bc]">
              <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-xs max-w-none prose-invert">
                {msg.thoughts!}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}

      {msg.content && (
        renderMarkdown ? (
          <div className="lvaigent-response-markdown prose prose-sm max-w-none prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: CodeBlock }}>{msg.content}</ReactMarkdown>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-[14px] leading-7 text-[#d9dce7]">
            {stripMarkdown(msg.content)}
          </p>
        )
      )}

      {isGenerating && latestAssistantId === msg.id && msg.tasks && msg.tasks.length > 0 && <TaskSummary tasks={msg.tasks} />}

      {msg.content && (
        <div className="mt-5 flex items-center gap-1 text-[#777e96]">
          <ActionBtn
            icon={renderMarkdown ? Type : Code}
            tooltip={renderMarkdown ? "Xem văn bản thuần" : "Xem Markdown"}
            onClick={() => setRenderMarkdown((value) => !value)}
            active={!renderMarkdown}
          />
          <ActionBtn
            icon={copied ? Check : Copy}
            tooltip={copied ? "Đã sao chép" : "Sao chép"}
            onClick={handleCopy}
          />
          <ActionBtn icon={FileText} tooltip="Xuất tài liệu" onClick={() => exportAsDoc(msg.content)} />
          <ActionBtn icon={Volume2} tooltip="Nghe" onClick={handleListen} />
          <span className="ml-2 text-[10px] text-[#60677f]">{formatTimestamp(msg.timestamp)}</span>
        </div>
      )}
    </article>
  );
}

function isAssistantStillGenerating(msg: Message): boolean {
  if (msg.role !== "assistant") return false;
  return (msg.tasks || []).some((task) => task.status === "running");
}

function ActionBtn({
  icon: Icon,
  tooltip,
  onClick,
  active,
}: {
  icon: React.ElementType;
  tooltip: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={`rounded-md p-1.5 transition-colors ${
        active
          ? "bg-mimoorange-soft text-mimoorange"
          : "text-[#777e96] hover:bg-[#25253b] hover:text-[#e8eaf1]"
      }`}
    >
      <Icon size={14} />
    </button>
  );
}
