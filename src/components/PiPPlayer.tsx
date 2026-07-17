import { useRef } from "react";
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
  X,
} from "lucide-react";
import { useStore } from "../store";
import { findBestVoice } from "../utils";

function speak(entry: { content: string }, onStateChange: (playing: boolean) => void) {
  const store = useStore.getState();
  const lang = store.settings.voiceLang || "vi-VN";
  const u = new SpeechSynthesisUtterance(entry.content);
  u.lang = lang;
  u.rate = 1.0;
  const bestVoice = findBestVoice(lang, store.settings.voiceModel);
  if (bestVoice) u.voice = bestVoice;
  u.onstart = () => onStateChange(true);
  u.onend = () => onStateChange(false);
  u.onerror = () => onStateChange(false);
  speechSynthesis.speak(u);
}

export default function PiPPlayer() {
  const {
    pipVisible,
    pipPlaying,
    pipTitle,
    pipSubtitle,
    pipProgress,
    pipQueue,
    pipIndex,
    setPipVisible,
    setPipPlaying,
    setPipProgress,
    setPipIndex,
  } = useStore();

  const progressRef = useRef<HTMLDivElement>(null);

  if (!pipVisible) return null;

  const handleTogglePlay = () => {
    if (pipPlaying) {
      speechSynthesis.pause();
      setPipPlaying(false);
    } else {
      speechSynthesis.resume();
      setPipPlaying(true);
    }
  };

  const playEntry = (entry: { content: string; title?: string }, idx: number, store: ReturnType<typeof useStore.getState>) => {
    store.setPipIndex(idx);
    store.setPipProgress(0);
    store.setPipTitle(entry.title || "Cuộc trò chuyện");
    store.setPipSubtitle(entry.content.slice(0, 80) + (entry.content.length > 80 ? "..." : ""));
    speechSynthesis.cancel();
    speak(entry, (playing) => store.setPipPlaying(playing));
  };

  const handleSeek = (dir: "back" | "forward") => {
    speechSynthesis.cancel();
    const store = useStore.getState();
    if (dir === "back") {
      store.setPipProgress(Math.max(0, pipProgress - 10));
    } else {
      store.setPipProgress(Math.min(100, pipProgress + 10));
    }
    const entry = pipQueue[pipIndex];
    if (entry) speak(entry, (playing) => store.setPipPlaying(playing));
  };

  const handlePrev = () => {
    if (pipIndex <= 0) return;
    const store = useStore.getState();
    const entry = pipQueue[pipIndex - 1];
    if (entry) playEntry(entry, pipIndex - 1, store);
  };

  const handleNext = () => {
    if (pipIndex >= pipQueue.length - 1) return;
    const store = useStore.getState();
    const entry = pipQueue[pipIndex + 1];
    if (entry) playEntry(entry, pipIndex + 1, store);
  };

  const handleClose = () => {
    speechSynthesis.cancel();
    setPipVisible(false);
    setPipPlaying(false);
    setPipProgress(0);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[340px] bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-700/50 overflow-hidden select-none">
      <button
        onClick={handleClose}
        className="absolute top-2 right-2 z-10 p-1 text-gray-400 hover:text-white rounded-full hover:bg-gray-700/50 transition-colors"
      >
        <X size={14} />
      </button>

      <div className="px-4 pt-4 pb-2 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white truncate">
            {pipTitle || "Cuộc trò chuyện"}
          </h3>
          <p className="text-[11px] text-gray-400 truncate">
            {pipSubtitle || "Đang phát nội dung..."}
          </p>
        </div>
        <button
          onClick={handleTogglePlay}
          className="shrink-0 w-11 h-11 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg transition-colors"
        >
          {pipPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
      </div>

      <div className="px-4 py-2">
        <div
          ref={progressRef}
          className="w-full h-1.5 bg-gray-700 rounded-full cursor-pointer overflow-hidden"
        >
          <div
            className="h-full bg-green-400 rounded-full transition-all duration-300"
            style={{ width: `${pipProgress}%` }}
          />
        </div>
      </div>

      <div className="px-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <NavBtn icon={SkipBack} onClick={handlePrev} disabled={pipIndex <= 0} title="Bài trước" />
          <NavBtn icon={Rewind} onClick={() => handleSeek("back")} title="Tua lại 10s" />
        </div>
        <div className="flex items-center gap-2">
          <NavBtn icon={FastForward} onClick={() => handleSeek("forward")} title="Tua đi 10s" />
          <NavBtn icon={SkipForward} onClick={handleNext} disabled={pipIndex >= pipQueue.length - 1} title="Bài tiếp" />
        </div>
      </div>
    </div>
  );
}

function NavBtn({
  icon: Icon,
  onClick,
  disabled,
  title,
}: {
  icon: React.ElementType;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
    >
      <Icon size={15} />
    </button>
  );
}
