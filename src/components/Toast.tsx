import { useEffect } from "react";
import { X, CheckCircle, AlertCircle, FolderOpen } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";

export default function Toast() {
  const { toast, clearToast } = useStore();

  useEffect(() => {
    if (toast) {
      const t = setTimeout(clearToast, 6000);
      return () => clearTimeout(t);
    }
  }, [toast, clearToast]);

  if (!toast) return null;

  const isError = toast.type === "error";

  const handleOpenFolder = async (path: string) => {
    try {
      const folderPath = path.replace(/[/\\][^/\\]+$/, "");
      await invoke("open_folder", { path: folderPath });
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-slide-up">
      <div
        className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-panel border max-w-md ${
          isError
            ? "bg-red-950/90 border-red-800"
            : "bg-[#1a1f2b] border-[#2f3848]"
        }`}
      >
        <div className="mt-0.5 shrink-0">
          {isError ? (
            <AlertCircle size={18} className="text-red-400" />
          ) : (
            <CheckCircle size={18} className="text-green-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium ${
              isError ? "text-red-200" : "text-[#e6e9ef]"
            }`}
          >
            {isError ? "Tải xuống thất bại" : "Tải xuống thành công"}
          </p>
          {toast.path && (
            <p className="text-[11px] text-[#9aa4b2] mt-0.5 truncate">
              {toast.path}
            </p>
          )}
          {!isError && toast.path && (
            <button
              onClick={() => handleOpenFolder(toast.path!)}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-mimoorange hover:text-mimoorange-300 bg-mimoorange-soft px-2 py-0.5 rounded-md transition-colors"
            >
              <FolderOpen size={12} />
              Mở vị trí lưu tệp
            </button>
          )}
        </div>
        <button
          onClick={clearToast}
          className="shrink-0 p-0.5 text-[#9aa4b2] hover:text-[#e6e9ef] rounded transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
