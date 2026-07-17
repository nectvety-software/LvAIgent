import { useState, useMemo } from "react";
import { Folder, File, ChevronRight, ChevronDown, FolderOpen, X, ExternalLink } from "lucide-react";
import { useStore } from "../store";
import type { ProjectFile } from "../types";
import CodeContextMenu from "./CodeContextMenu";

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  ext?: string;
}

function buildTree(files: ProjectFile[], projectPath: string): TreeNode[] {
  const root: TreeNode[] = [];
  const map = new Map<string, TreeNode>();

  for (const f of files) {
    const parts = f.path.replace(/\\/g, "/").split("/");
    let current = root;
    let currentPath = projectPath.replace(/\\/g, "/");

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath += "/" + part;
      const isLast = i === parts.length - 1;

      if (isLast) {
        current.push({ name: part, path: f.path, isDir: false, children: [], ext: f.ext });
      } else {
        let existing = current.find((n) => n.name === part && n.isDir);
        if (!existing) {
          existing = { name: part, path: currentPath, isDir: true, children: [] };
          current.push(existing);
        }
        current = existing.children;
      }
    }
  }

  return root;
}

function TreeItem({
  node,
  depth,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const openFilePath = useStore((s) => s.openFilePath);
  const isActive = openFilePath === node.path;

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={`w-full flex items-center gap-1 px-1 py-0.5 text-xs rounded hover:bg-gray-100 transition-colors text-left ${
            depth === 0 ? "font-medium text-gray-700" : "text-gray-600"
          }`}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {expanded ? (
            <ChevronDown size={10} className="text-gray-400 shrink-0" />
          ) : (
            <ChevronRight size={10} className="text-gray-400 shrink-0" />
          )}
          {expanded ? (
            <FolderOpen size={12} className="text-yellow-500 shrink-0" />
          ) : (
            <Folder size={12} className="text-yellow-500 shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && (
          <div>
            {node.children.map((child, i) => (
              <TreeItem key={`${child.path}-${i}`} node={child} depth={depth + 1} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const iconColor =
    node.ext === "ts" || node.ext === "tsx" ? "text-blue-500"
    : node.ext === "js" || node.ext === "jsx" ? "text-yellow-500"
    : node.ext === "json" ? "text-green-500"
    : node.ext === "css" || node.ext === "scss" ? "text-pink-500"
    : node.ext === "html" ? "text-orange-500"
    : node.ext === "rs" ? "text-purple-500"
    : node.ext === "py" ? "text-blue-600"
    : node.ext === "md" ? "text-gray-500"
    : "text-gray-400";

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`w-full flex items-center gap-1 px-1 py-0.5 text-xs rounded transition-colors text-left ${
        isActive
          ? "bg-blue-100 text-blue-800 font-medium"
          : "text-gray-600 hover:bg-gray-100"
      }`}
      style={{ paddingLeft: `${depth * 12 + 16}px` }}
    >
      <File size={12} className={`${iconColor} shrink-0`} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export default function ProjectPanel() {
  const {
    currentProject,
    projectFiles,
    closeProject,
    openProjectFile,
    openFilePath,
    openFileContent,
    openFileName,
    closeFile,
    saveProjectFile,
    addMessage,
  } = useStore();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");

  const tree = useMemo(
    () => (currentProject ? buildTree(projectFiles, currentProject.path) : []),
    [currentProject, projectFiles]
  );

  if (!currentProject) return null;

  const handleSelect = (path: string) => {
    openProjectFile(path);
    setEditing(false);
  };

  const handleSave = async () => {
    if (!openFilePath) return;
    try {
      await saveProjectFile(openFilePath, editContent);
      setEditing(false);
    } catch (e) {
      console.error("Save failed:", e);
    }
  };

  const handleSendToChat = () => {
    if (!openFilePath || !openFileContent) return;
    const name = openFileName || "file";
    const ext = name.split(".").pop() || "";
    addMessage({
      id: `sys_project_file_${Date.now()}`,
      role: "system",
      content: `[File: ${openFilePath}]\n\`\`\`${ext}\n${openFileContent}\n\`\`\``,
      timestamp: Date.now(),
    });
    closeFile();
  };

  return (
    <>
      {/* File Tree */}
      <div className="flex-1 overflow-y-auto text-[11px] sidebar-scroll border-b border-gray-200">
        <div className="p-2">
          {tree.map((node, i) => (
            <TreeItem key={`${node.path}-${i}`} node={node} depth={0} onSelect={handleSelect} />
          ))}
        </div>
        {projectFiles.length === 0 && (
          <p className="text-[10px] text-gray-400 text-center py-4">
            Không có file nào
          </p>
        )}
      </div>

      {/* File Viewer */}
      {openFilePath && openFileContent !== null && (
        <div className="border-t border-gray-200 bg-white flex flex-col" style={{ maxHeight: "50vh" }}>
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200 shrink-0">
            <span className="text-[11px] font-medium text-gray-700 truncate flex-1">
              {openFileName}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={handleSendToChat}
                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                title="Gửi đến chat"
              >
                <ExternalLink size={12} />
              </button>
              <button
                onClick={() => {
                  if (editing) {
                    setEditContent(openFileContent);
                    setEditing(false);
                  } else {
                    setEditContent(openFileContent);
                    setEditing(true);
                  }
                }}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded"
                title={editing ? "Hủy" : "Sửa"}
              >
                {editing ? <X size={12} /> : <File size={12} />}
              </button>
              <button
                onClick={closeFile}
                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                title="Đóng"
              >
                <X size={12} />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {editing ? (
              <CodeContextMenu text={editContent} filePath={openFilePath} onSendToChat={handleSendToChat} className="p-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-40 text-[11px] font-mono bg-gray-50 border border-gray-300 rounded p-2 resize-none outline-none focus:border-blue-400"
                  spellCheck={false}
                />
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={handleSave}
                    className="px-2 py-1 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Lưu
                  </button>
                  <button
                    onClick={() => { setEditContent(openFileContent); setEditing(false); }}
                    className="px-2 py-1 text-[10px] bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                  >
                    Hủy
                  </button>
                </div>
              </CodeContextMenu>
            ) : (
              <CodeContextMenu
                text={openFileContent}
                filePath={openFilePath}
                onSendToChat={handleSendToChat}
                onEdit={() => { setEditContent(openFileContent); setEditing(true); }}
              >
                <pre className="text-[11px] font-mono p-2 text-gray-800 whitespace-pre-wrap break-all select-text">
                  {openFileContent}
                </pre>
              </CodeContextMenu>
            )}
          </div>
        </div>
      )}
    </>
  );
}
