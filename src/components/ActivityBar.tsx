import { MessageSquare, FolderTree, Search, Settings, Sparkles } from "lucide-react";

export type ActivityView = "chat" | "explorer" | "search";

interface Props {
  activeView: ActivityView;
  onViewChange: (view: ActivityView) => void;
  onOpenSettings: () => void;
  onOpenSkills: () => void;
}

const views: { id: ActivityView; icon: typeof MessageSquare; label: string }[] = [
  { id: "chat", icon: MessageSquare, label: "Trò chuyện" },
  { id: "explorer", icon: FolderTree, label: "Dự án" },
  { id: "search", icon: Search, label: "Tìm kiếm" },
];

export default function ActivityBar({ activeView, onViewChange, onOpenSettings, onOpenSkills }: Props) {
  return (
    <nav className="uaget-activity w-[80px] min-w-[80px] flex flex-col items-center py-5 gap-3 select-none">
      {views.map((v) => {
        const Icon = v.icon;
        const isActive = activeView === v.id;
        return (
          <button
            key={v.id}
            onClick={() => onViewChange(v.id)}
            className={`uaget-activity-button w-12 h-12 flex items-center justify-center rounded-[10px] transition-colors relative ${
              isActive
                ? "text-mimoorange bg-mimoorange-soft"
                : "text-[#5f6b7a] hover:text-[#9aa4b2] hover:bg-[#1a1f2b]"
            }`}
            title={v.label}
          >
            {isActive && (
              <span className="absolute -left-4 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-mimoorange rounded-full" />
            )}
            <Icon size={24} />
          </button>
        );
      })}
      <button
        onClick={onOpenSkills}
        className="uaget-activity-button w-12 h-12 flex items-center justify-center rounded-[10px] transition-colors text-[#656b86] hover:text-mimoorange hover:bg-mimoorange-soft"
        title="Application Skills"
      >
        <Sparkles size={22} />
      </button>
      {/* Spacer */}
      <div className="flex-1" />
      {/* Settings at bottom */}
      <button
        onClick={onOpenSettings}
        className="uaget-activity-button w-12 h-12 flex items-center justify-center rounded-[10px] transition-colors text-[#656b86] hover:text-[#a8adc3] hover:bg-[#1c1c34]"
        title="Cài đặt"
      >
        <Settings size={22} />
      </button>
    </nav>
  );
}
