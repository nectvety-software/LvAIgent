import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { X, Trash2, ScrollText } from "lucide-react";
import type { TaskLogEntry } from "../types";

function LogIcon({ type }: { type: TaskLogEntry["type"] }) {
  const colors = {
    info: "bg-mimoorange",
    running: "bg-yellow-500 animate-pulse",
    success: "bg-green-400",
    error: "bg-red-400",
  };
  return (
    <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[type]} shrink-0 mt-1.5`} />
  );
}

interface TaskLogsProps {
  visible: boolean;
  onClose: () => void;
}

export default function TaskLogs({ visible, onClose }: TaskLogsProps) {
  const { taskLogs, clearTaskLogs } = useStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [taskLogs, visible]);

  if (!visible) return null;

  return (
    <div className="border-t border-[#232a36] bg-[#151922]/80 max-h-40 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-3 py-1 border-b border-[#232a36]">
        <div className="flex items-center gap-1.5">
          <ScrollText size={11} className="text-mimoorange" />
          <span className="text-[10px] font-medium text-[#9aa4b2]">
            Nhật ký ({taskLogs.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {taskLogs.length > 0 && (
            <button
              onClick={clearTaskLogs}
              className="text-[10px] text-[#5f6b7a] hover:text-mimoorange transition-colors px-1"
              title="Xóa nhật ký"
            >
              <Trash2 size={10} />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-[10px] text-[#5f6b7a] hover:text-mimoorange transition-colors px-1"
            title="Đóng"
          >
            <X size={10} />
          </button>
        </div>
      </div>
      <div className="overflow-y-auto flex-1 px-3 py-1 space-y-0.5">
        {taskLogs.length === 0 ? (
          <p className="text-[10px] text-[#5f6b7a] text-center py-2">Chưa có nhật ký</p>
        ) : (
          taskLogs.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2 text-[11px] leading-tight">
              <span className="text-[#5f6b7a] shrink-0 font-mono tabular-nums">
                {new Date(entry.timestamp).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <LogIcon type={entry.type} />
              <span className="text-[#9aa4b2] break-all">{entry.message}</span>
              {entry.detail && (
                <span className="text-[#5f6b7a] text-[10px] shrink-0">— {entry.detail}</span>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
