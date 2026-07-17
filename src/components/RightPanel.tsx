import { useState, useMemo, useRef, useEffect } from "react";
import {
  Folder, File, ChevronRight, ChevronDown, FolderOpen, X,
  PanelRightClose, ListTodo, CheckCircle, Loader, AlertCircle, Info, FolderClosed,
  Copy, GitCompareArrows,
} from "lucide-react";
import { useStore } from "../store";
import type { ProjectChange, ProjectFile } from "../types";

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  ext?: string;
}

function buildTree(files: ProjectFile[], projectPath: string): TreeNode[] {
  const root: TreeNode[] = [];
  for (const f of files) {
    const parts = f.path.replace(/\\/g, "/").split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (isLast) {
        current.push({ name: part, path: f.path, isDir: false, children: [], ext: f.ext });
      } else {
        let existing = current.find((n) => n.name === part && n.isDir);
        if (!existing) {
          existing = { name: part, path: "", isDir: true, children: [] };
          current.push(existing);
        }
        current = existing.children;
      }
    }
  }
  return root;
}

function TreeItem({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={`w-full flex items-center gap-1 px-1 py-0.5 text-xs rounded hover:bg-[#20262f] transition-colors text-left ${
            depth === 0 ? "font-medium text-[#e6e9ef]" : "text-[#9aa4b2]"
          }`}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {expanded ? <ChevronDown size={10} className="text-[#5f6b7a] shrink-0" /> : <ChevronRight size={10} className="text-[#5f6b7a] shrink-0" />}
          {expanded ? <FolderOpen size={12} className="text-mimoorange shrink-0" /> : <Folder size={12} className="text-mimoorange shrink-0" />}
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && (
          <div>
            {node.children.map((child, i) => (
              <TreeItem key={`${child.path}-${i}`} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const iconColor =
    node.ext === "ts" || node.ext === "tsx" ? "text-blue-400"
    : node.ext === "js" || node.ext === "jsx" ? "text-yellow-400"
    : node.ext === "json" ? "text-green-400"
    : node.ext === "css" || node.ext === "scss" ? "text-pink-400"
    : node.ext === "html" ? "text-mimoorange"
    : node.ext === "rs" ? "text-purple-400"
    : node.ext === "py" ? "text-blue-400"
    : node.ext === "md" ? "text-[#5f6b7a]"
    : "text-[#5f6b7a]";

  return (
    <div
      className="w-full flex items-center gap-1 px-1 py-0.5 text-xs rounded text-left text-[#9aa4b2]"
      style={{ paddingLeft: `${depth * 12 + 16}px` }}
    >
      <File size={12} className={`${iconColor} shrink-0`} />
      <span className="truncate">{node.name}</span>
    </div>
  );
}

const taskIcons: Record<string, typeof Loader> = {
  running: Loader,
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};
const taskColors: Record<string, string> = {
  running: "text-yellow-400",
  success: "text-green-400",
  error: "text-red-400",
  info: "text-blue-400",
};
const taskBg: Record<string, string> = {
  running: "bg-yellow-500/10 border-yellow-500/30",
  success: "bg-green-500/10 border-green-500/30",
  error: "bg-red-500/10 border-red-500/30",
  info: "bg-blue-500/10 border-blue-500/30",
};

type DiffLine = { kind: "same" | "add" | "remove"; text: string };

function makeCompactDiff(change: ProjectChange): DiffLine[] {
  const before = change.before.split("\n");
  const after = change.after.split("\n");
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix++;

  const contextStart = Math.max(0, prefix - 3);
  const lines: DiffLine[] = before.slice(contextStart, prefix).map((text) => ({ kind: "same", text }));
  lines.push(...before.slice(prefix, before.length - suffix).map((text) => ({ kind: "remove" as const, text })));
  lines.push(...after.slice(prefix, after.length - suffix).map((text) => ({ kind: "add" as const, text })));
  lines.push(...after.slice(Math.max(prefix, after.length - suffix), Math.min(after.length, after.length - suffix + 3)).map((text) => ({ kind: "same" as const, text })));
  return lines.length ? lines : [{ kind: "same", text: "Không có khác biệt nội dung" }];
}

function ChangesView({ changes }: { changes: ProjectChange[] }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const selected = changes.find((change) => change.path === selectedPath) || changes[0];
  const diff = useMemo(() => selected ? makeCompactDiff(selected) : [], [selected]);

  useEffect(() => {
    if (selectedPath && !changes.some((change) => change.path === selectedPath)) setSelectedPath(null);
  }, [changes, selectedPath]);

  if (!selected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center bg-[#0b0d12]">
        <GitCompareArrows size={32} strokeWidth={1.3} className="mb-3 text-[#5d647b]" />
        <p className="text-sm text-[#9298ae]">Chưa có tệp nào thay đổi</p>
        <p className="mt-2 text-[11px] leading-5 text-[#5d647b]">Các thay đổi do AI Agent tạo sẽ tự động xuất hiện tại đây theo thời gian thực.</p>
      </div>
    );
  }

  const copyDiff = () => navigator.clipboard.writeText(selected.after || selected.before).catch(() => undefined);
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0b0d12]">
      <div className="max-h-[178px] shrink-0 overflow-y-auto border-b border-[#24283a] p-2">
        {changes.map((change) => (
          <button
            key={change.path}
            onClick={() => setSelectedPath(change.path)}
            className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${selected.path === change.path ? "bg-[#24243a]" : "hover:bg-[#191c27]"}`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${change.status === "added" ? "bg-emerald-400" : change.status === "deleted" ? "bg-rose-400" : "bg-amber-400"}`} />
            <span className="min-w-0 flex-1 truncate text-[11px] text-[#c9cddd]">{change.path}</span>
            <span className="text-[10px] text-emerald-400">+{change.additions}</span>
            <span className="text-[10px] text-rose-400">-{change.deletions}</span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="overflow-hidden rounded-xl border border-[#303348] bg-[#171923] shadow-lg">
          <div className="flex items-center justify-between border-b border-[#303348] px-3 py-2">
            <span className="truncate pr-3 font-mono text-[10px] text-[#9ea5bb]">{selected.path}</span>
            <button onClick={copyDiff} className="rounded-md p-1.5 text-[#747b94] hover:bg-[#292c3c] hover:text-white" title="Sao chép nội dung">
              <Copy size={13} />
            </button>
          </div>
          <pre className="overflow-x-auto py-2 font-mono text-[10px] leading-5">
            {diff.map((line, index) => (
              <div key={`${line.kind}-${index}`} className={`flex min-w-max px-3 ${line.kind === "add" ? "bg-emerald-500/10 text-emerald-300" : line.kind === "remove" ? "bg-rose-500/10 text-rose-300" : "text-[#8c93a8]"}`}>
                <span className="mr-3 w-3 select-none text-center opacity-70">{line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "}</span>
                <code>{line.text || " "}</code>
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function RightPanel({ onClose }: { onClose?: () => void }) {
  const {
    currentProject,
    projectFiles,
    closeProject,
    taskLogs,
    clearTaskLogs,
    isGenerating,
    projectChanges,
    refreshProjectChanges,
  } = useStore();
  const [showTasks, setShowTasks] = useState(true);
  const [activeTab, setActiveTab] = useState<"changes" | "files">("files");
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [taskLogs]);

  useEffect(() => {
    if (!currentProject) return;
    void refreshProjectChanges();
    if (!isGenerating) return;
    const timer = window.setInterval(() => void refreshProjectChanges(), 800);
    return () => window.clearInterval(timer);
  }, [currentProject?.path, isGenerating, refreshProjectChanges]);

  const tree = useMemo(
    () => (currentProject ? buildTree(projectFiles, currentProject.path) : []),
    [currentProject, projectFiles]
  );

  if (!currentProject) {
    return (
      <div className="uaget-right-panel h-full w-[428px] min-w-[360px] max-w-[460px] border-l flex flex-col overflow-hidden relative">
        <div className="uaget-file-tabs h-[76px] min-h-[76px] flex items-center justify-end gap-2 px-4 border-b">
          {onClose && (
            <button
              onClick={onClose}
              className="mr-auto flex h-9 w-9 items-center justify-center rounded-lg text-[#777d96] transition-colors hover:bg-[#25253d] hover:text-[#d8dbe7]"
              title="Thu gọn panel"
            >
              <PanelRightClose size={16} />
            </button>
          )}
          <button onClick={() => setActiveTab("changes")} className={`uaget-top-tab h-10 px-5 rounded-[10px] text-[13px] font-medium ${activeTab === "changes" ? "active" : ""}`}>Changes</button>
          <button onClick={() => setActiveTab("files")} className={`uaget-top-tab h-10 px-5 rounded-[10px] text-[13px] font-semibold ${activeTab === "files" ? "active" : ""}`}>All file</button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <FolderClosed size={34} strokeWidth={1.35} className="text-[#656b86] mb-3" />
          <p className="text-sm text-[#7f849d]">Chưa có dự án nào</p>
          <p className="text-xs text-[#555b76] mt-2">Nhấn Dự án ở thanh bên để mở project</p>
        </div>
      </div>
    );
  }

  return (
    <div className="uaget-right-panel h-full w-[428px] min-w-[360px] max-w-[460px] border-l flex flex-col overflow-hidden">
      <div className="uaget-file-tabs h-[76px] min-h-[76px] flex items-center justify-end gap-2 px-4 border-b">
        {onClose && (
          <button
            onClick={onClose}
            className="mr-auto flex h-9 w-9 items-center justify-center rounded-lg text-[#777d96] transition-colors hover:bg-[#25253d] hover:text-[#d8dbe7]"
            title="Thu gọn panel"
          >
            <PanelRightClose size={16} />
          </button>
        )}
        <button onClick={() => setActiveTab("changes")} className={`uaget-top-tab h-10 px-5 rounded-[10px] text-[13px] font-medium ${activeTab === "changes" ? "active" : ""}`}>
          Changes{projectChanges.length > 0 && <span className="ml-1.5 rounded-full bg-mimoorange/20 px-1.5 py-0.5 text-[9px] text-mimoorange">{projectChanges.length}</span>}
        </button>
        <button onClick={() => setActiveTab("files")} className={`uaget-top-tab h-10 px-5 rounded-[10px] text-[13px] font-semibold ${activeTab === "files" ? "active" : ""}`}>All file</button>
      </div>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#232a36] shrink-0 bg-[#151922]">
        <div className="flex items-center gap-1.5 truncate flex-1">
          <FolderClosed size={14} className="text-mimoorange shrink-0" />
          <span className="text-xs font-medium text-[#e6e9ef] truncate">{currentProject.folder}</span>
          <span className="text-[9px] text-[#5f6b7a] shrink-0">({projectFiles.length} files)</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={closeProject} className="p-1 text-[#9aa4b2] hover:text-red-400 hover:bg-red-500/10 rounded" title="Đóng dự án">
            <X size={13} />
          </button>
        </div>
      </div>

      {activeTab === "changes" ? (
        <ChangesView changes={projectChanges} />
      ) : (
        <>

      {/* Tasks Log */}
      {isGenerating && taskLogs.length > 0 && (
        <div className="border-b border-[#232a36] shrink-0">
          <button
            onClick={() => setShowTasks(!showTasks)}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-[#9aa4b2] uppercase hover:bg-[#1a1f2b] transition-colors"
          >
            <ListTodo size={12} />
            <span>Tasks</span>
            <span className="text-[9px] text-[#5f6b7a]">({taskLogs.length})</span>
            {isGenerating && <Loader size={10} className="animate-spin text-mimoorange ml-auto" />}
            {showTasks ? <ChevronDown size={10} className="ml-auto text-[#5f6b7a]" /> : <ChevronRight size={10} className="ml-auto text-[#5f6b7a]" />}
          </button>
          {showTasks && (
            <div className="max-h-[160px] overflow-y-auto px-3 pb-2 space-y-1">
              {taskLogs.map((log) => {
                const Icon = taskIcons[log.type] || Info;
                return (
                  <div key={log.id} className={`text-[10px] px-2 py-1 rounded border ${taskBg[log.type] || "bg-[#1a1f2b] border-[#2f3848]"}`}>
                    <div className="flex items-center gap-1">
                      <Icon size={10} className={`${taskColors[log.type] || "text-[#9aa4b2]"} ${log.type === "running" ? "animate-spin" : ""}`} />
                      <span className={`${taskColors[log.type] || "text-[#9aa4b2]"} truncate flex-1`}>{log.message}</span>
                    </div>
                    {log.detail && <p className="text-[9px] text-[#5f6b7a] mt-0.5 truncate">{log.detail}</p>}
                  </div>
                );
              })}
              <div ref={logEndRef} />
              {taskLogs.length > 10 && (
                <button onClick={clearTaskLogs} className="text-[9px] text-[#5f6b7a] hover:text-mimoorange w-full text-center py-0.5">
                  Xóa tất cả
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto text-[11px] sidebar-scroll bg-[#0b0d12]">
        <div className="p-2">
          {tree.map((node, i) => (
            <TreeItem key={`${node.path}-${i}`} node={node} depth={0} />
          ))}
        </div>
        {projectFiles.length === 0 && (
          <p className="text-[10px] text-[#5f6b7a] text-center py-4">Không có file nào</p>
        )}
      </div>

      {/* Code Preview removed
      <div className="flex min-h-[108px] max-h-[48%] shrink-0 flex-col border-t border-[#2b2e40] bg-[#101119]">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#292c3c] bg-[#171923] px-3">
          <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#858ca4]">
            <FileCode2 size={13} className="shrink-0 text-mimoorange" />
            <span className="truncate">{openFileName || "Code Preview"}</span>
            {openFileName && <span className="rounded bg-[#26283a] px-1.5 py-0.5 font-mono text-[8px] text-[#777e96]">{openFileName.split(".").pop()?.toUpperCase() || "TEXT"}</span>}
          </span>
          {openFilePath && openFileContent !== null && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={handleSendToChat} className="p-1 text-[#9aa4b2] hover:text-mimoorange hover:bg-[#25283a] rounded" title="Gửi đến chat"><ExternalLink size={12} /></button>
              <button
                onClick={() => {
                  if (editing) { setEditContent(openFileContent); setEditing(false); }
                  else { setEditContent(openFileContent); setEditing(true); }
                }}
                className="p-1 text-[#9aa4b2] hover:text-mimoorange hover:bg-[#25283a] rounded"
                title={editing ? "Hủy" : "Sửa"}
              >
                {editing ? <X size={12} /> : <File size={12} />}
              </button>
              <button onClick={closeFile} className="p-1 text-[#9aa4b2] hover:text-red-400 hover:bg-red-500/10 rounded" title="Đóng"><X size={12} /></button>
            </div>
          )}
        </div>
        {openFilePath && openFileContent !== null ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            {editing ? (
              <CodeContextMenu text={editContent} filePath={openFilePath} onSendToChat={handleSendToChat} className="flex h-full flex-col p-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[120px] flex-1 resize-none rounded-lg border border-[#2f3848] bg-[#0b0d12] p-2 font-mono text-[11px] text-[#e6e9ef] outline-none focus:border-mimoorange"
                  spellCheck={false}
                />
                <div className="flex gap-1 mt-1.5">
                  <button onClick={handleSave} className="px-2.5 py-1 text-[10px] btn-accent">Lưu</button>
                  <button onClick={() => { setEditContent(openFileContent); setEditing(false); }} className="px-2.5 py-1 text-[10px] bg-[#20262f] text-[#9aa4b2] rounded hover:bg-[#2a313c]">Hủy</button>
                </div>
              </CodeContextMenu>
            ) : (
              <CodeContextMenu
                text={openFileContent}
                filePath={openFilePath}
                onSendToChat={handleSendToChat}
                onEdit={() => { setEditContent(openFileContent); setEditing(true); }}
                className="h-full overflow-hidden"
              >
                <div className="code-scroll flex h-full overflow-auto bg-[#0d0e15] font-mono text-[10px] leading-5">
                  <pre className="select-none border-r border-[#25283a] bg-[#11131c] px-2 py-2 text-right text-[#4f566d]">
                    {openFileContent.split("\n").map((_, index) => <span key={index} className="block">{index + 1}</span>)}
                  </pre>
                  <pre className="min-w-max flex-1 whitespace-pre px-3 py-2 text-[#c9cdda] select-text"><code>{openFileContent}</code></pre>
                </div>
              </CodeContextMenu>
            )}
          </div>
        ) : (
          <button
            onClick={() => projectFiles[0] && handleSelect(projectFiles[0].path)}
            disabled={projectFiles.length === 0}
            className="flex min-h-[72px] flex-1 flex-col items-center justify-center gap-1 text-[#626980] transition-colors hover:bg-[#151722] hover:text-[#8e95aa] disabled:pointer-events-none"
          >
            <FileCode2 size={20} strokeWidth={1.4} />
            <span className="text-[10px]">Chọn một tệp để xem trước code</span>
          </button>
        )}
      </div> */}
        </>
      )}
    </div>
  );
}

