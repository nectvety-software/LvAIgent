import { useState, useEffect } from "react";
import { X, ExternalLink, Download, Rocket, RefreshCw, Loader } from "lucide-react";
import ReactMarkdown from "react-markdown";

const CURRENT_VERSION = "1.0.0";
const REPO = "XiaomiMiMo/MiMo-Code";
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const DOWNLOAD_URL = `https://github.com/${REPO}/releases/latest`;

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
}

interface Props {
  onClose: () => void;
}

function parseVersion(tag: string): number[] {
  return tag.replace(/^v/i, "").split(".").map(Number);
}

function isNewer(latest: string, current: string): boolean {
  const l = parseVersion(latest);
  const c = parseVersion(current);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const a = l[i] || 0;
    const b = c[i] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

function getSkippedVersion(): string | null {
  try {
    return localStorage.getItem("mimo_skip_version");
  } catch { return null; }
}

function setSkippedVersion(v: string) {
  try { localStorage.setItem("mimo_skip_version", v); } catch {}
}

export function checkForUpdates(): Promise<GitHubRelease | null> {
  return fetch(API_URL, { headers: { Accept: "application/vnd.github.v3+json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((data: GitHubRelease | null) => {
      if (!data) return null;
      if (!isNewer(data.tag_name, CURRENT_VERSION)) return null;
      if (getSkippedVersion() === data.tag_name) return null;
      return data;
    })
    .catch(() => null);
}

export default function UpdateDialog({ onClose }: Props) {
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    checkForUpdates().then((r) => {
      setRelease(r);
      setLoading(false);
    }).catch(() => {
      setError("Không thể kiểm tra phiên bản mới");
      setLoading(false);
    });
  }, []);

  const handleSkip = () => {
    if (release) setSkippedVersion(release.tag_name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-[#101319] rounded-2xl shadow-panel border border-[#2f3848] w-[480px] max-w-[90vw] max-h-[80vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#232a36]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#cfd6e4] to-mimoorange flex items-center justify-center">
              <Rocket size={16} className="text-[#0b0d12]" />
            </div>
            <h2 className="text-base font-semibold text-[#e6e9ef]">Cập nhật phiên bản mới</h2>
          </div>
          <button onClick={onClose} className="p-1 text-[#9aa4b2] hover:text-[#e6e9ef] rounded hover:bg-[#1a1f2b] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 modal-scroll">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader size={24} className="animate-spin text-mimoorange" />
              <span className="ml-3 text-sm text-[#9aa4b2]">Đang kiểm tra...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-sm text-[#9aa4b2]">{error}</p>
              <button
                onClick={() => { setLoading(true); setError(""); checkForUpdates().then(setRelease).catch(() => setError("Không thể kiểm tra")).finally(() => setLoading(false)); }}
                className="mt-3 flex items-center gap-1.5 mx-auto px-3 py-1.5 text-xs bg-[#20262f] hover:bg-[#2a313c] text-[#9aa4b2] rounded-lg transition-colors"
              >
                <RefreshCw size={12} />
                Thử lại
              </button>
            </div>
          ) : !release ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Download size={24} className="text-green-400" />
              </div>
              <p className="text-sm font-medium text-[#e6e9ef]">Bạn đang dùng phiên bản mới nhất</p>
              <p className="text-xs text-[#5f6b7a] mt-1">LvAIgent v{CURRENT_VERSION}</p>
            </div>
          ) : (
            <>
              {/* Version comparison */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 bg-[#0b0d12] rounded-lg px-3 py-2 text-center border border-[#2f3848]">
                  <p className="text-[10px] text-[#5f6b7a] uppercase">Hiện tại</p>
                  <p className="text-sm font-semibold text-[#9aa4b2]">v{CURRENT_VERSION}</p>
                </div>
                <Rocket size={18} className="text-mimoorange shrink-0" />
                <div className="flex-1 bg-mimoorange-soft rounded-lg px-3 py-2 text-center border border-mimoorange/30">
                  <p className="text-[10px] text-mimoorange uppercase font-medium">Mới nhất</p>
                  <p className="text-sm font-semibold text-mimoorange">{release.tag_name}</p>
                </div>
              </div>

              {/* Release date */}
              <p className="text-[11px] text-[#5f6b7a] mb-3">
                Phát hành: {new Date(release.published_at).toLocaleDateString("vi-VN")}
              </p>

              {/* Changelog */}
              <div className="bg-[#0b0d12] rounded-lg p-3 max-h-[280px] overflow-y-auto border border-[#232a36]">
                <p className="text-[10px] font-semibold text-[#5f6b7a] uppercase mb-2">Nhật ký thay đổi</p>
                <div className="prose prose-xs max-w-none text-xs text-[#c4ccd8] leading-relaxed prose-invert [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_ul]:pl-4 [&_li]:my-0.5 [&_a]:text-mimoorange [&_code]:text-[10px] [&_code]:bg-[#1a1f2b] [&_code]:px-1 [&_code]:rounded [&_pre]:text-[10px] [&_pre]:bg-[#1a1f2b] [&_pre]:text-[#e6e9ef] [&_pre]:p-2 [&_pre]:rounded">
                  <ReactMarkdown>{release.body || "*Không có ghi chú*"}</ReactMarkdown>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#232a36] bg-[#151922] rounded-b-2xl">
          {release ? (
            <>
              <button onClick={handleSkip} className="px-3 py-1.5 text-xs text-[#9aa4b2] hover:text-[#e6e9ef] hover:bg-[#1a1f2b] rounded-lg transition-colors">
                Bỏ qua phiên bản này
              </button>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-1.5 text-xs bg-[#1a1f2b] border border-[#2f3848] hover:bg-[#20262f] text-[#9aa4b2] rounded-lg transition-colors">
                  Để sau
                </button>
                <a
                  href={release.html_url || DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs btn-accent"
                >
                  <ExternalLink size={12} />
                  Cập nhật ngay
                </a>
              </div>
            </>
          ) : (
            <button onClick={onClose} className="ml-auto px-4 py-1.5 text-xs bg-[#1a1f2b] hover:bg-[#20262f] text-[#9aa4b2] rounded-lg transition-colors">
              Đóng
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
