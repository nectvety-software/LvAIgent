import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { BookOpen, FileDown, Plus, Power, Sparkles, Trash2, X } from "lucide-react";
import { useStore } from "../store";
import CodeContextMenu from "./CodeContextMenu";

const CODING_SKILL_TEMPLATES = [
  {
    name: "codebase-explorer",
    description: "Đọc cấu trúc dự án và xác định chính xác vùng cần thay đổi",
    content: `---\nname: codebase-explorer\ndescription: Khám phá codebase trước khi sửa code\n---\n\n# Workflow\n1. Đọc AGENTS.md và cấu trúc dự án.\n2. Tìm entry points, dependency và các consumer liên quan.\n3. Chỉ đọc file cần thiết.\n4. Tóm tắt phạm vi ảnh hưởng và rủi ro trước khi triển khai.`,
  },
  {
    name: "safe-implementation",
    description: "Triển khai thay đổi nhỏ, đúng phạm vi và dễ kiểm chứng",
    content: `---\nname: safe-implementation\ndescription: Triển khai code an toàn và tối thiểu\n---\n\n# Rules\n- Giữ nguyên kiến trúc và convention hiện có.\n- Ưu tiên patch nhỏ, không rewrite ngoài phạm vi.\n- Bảo toàn tương thích ngược và dữ liệu người dùng.\n- Sau khi sửa phải chạy kiểm tra phù hợp với mức rủi ro.`,
  },
  {
    name: "performance-cache",
    description: "Tối ưu I/O, cache, render và mức sử dụng bộ nhớ",
    content: `---\nname: performance-cache\ndescription: Tối ưu hiệu năng ứng dụng và cache\n---\n\n# Checklist\n- Đo hoặc xác định đường nóng trước khi tối ưu.\n- Tránh quét file, parse JSON và render lặp lại.\n- Dùng cache có giới hạn, invalidation rõ ràng và nạp nền.\n- Không đánh đổi correctness để lấy cảm giác nhanh tạm thời.`,
  },
  {
    name: "debug-root-cause",
    description: "Chẩn đoán nguyên nhân gốc trước khi sửa lỗi",
    content: `---\nname: debug-root-cause\ndescription: Debug theo bằng chứng và nguyên nhân gốc\n---\n\n# Workflow\n1. Tái hiện lỗi và thu thập log.\n2. Thu hẹp phạm vi bằng dữ liệu, không phỏng đoán.\n3. Sửa nguyên nhân gốc với patch nhỏ nhất.\n4. Thêm regression test hoặc bước xác minh cụ thể.`,
  },
  {
    name: "test-and-review",
    description: "Kiểm thử và review thay đổi trước khi bàn giao",
    content: `---\nname: test-and-review\ndescription: Test, review và chống regression\n---\n\n# Review\n- Kiểm tra edge cases, error handling và race conditions.\n- Chạy build, typecheck, unit/integration test liên quan.\n- Kiểm tra dữ liệu nhạy cảm và thao tác phá hủy.\n- Báo rõ phần đã kiểm tra và giới hạn còn lại.`,
  },
  {
    name: "coding-orchestrator",
    description: "Kết hợp explorer, implementation, optimizer và reviewer",
    content: `---\nname: coding-orchestrator\ndescription: Điều phối workflow coding hoàn chỉnh\n---\n\n# Orchestration\nThực hiện theo pha: Explore → Plan → Implement → Test → Review.\nCó thể phối hợp $explorer, $implementer, $tester, $reviewer và $optimizer.\nMỗi pha chỉ chuyển tiếp thông tin cần thiết; tổng hợp một kết quả cuối cùng, tránh làm lại công việc của pha trước.`,
  },
];

interface SkillPreview {
  key: string;
  name: string;
  description: string;
  content: string;
  kind: "template" | "installed";
}

export default function SkillsDialog({ onClose }: { onClose: () => void }) {
  const { skills, currentProject, importSkill, toggleSkill, removeSkill } = useStore();
  const [markdown, setMarkdown] = useState("");
  const [sourcePath, setSourcePath] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<SkillPreview | null>(null);
  const visibleSkills = useMemo(
    () => skills
      .filter((skill) => !skill.workspacePath || skill.workspacePath === currentProject?.path)
      .filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(search.toLowerCase())),
    [skills, currentProject?.path, search]
  );

  const pickSkillFile = async () => {
    setError("");
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: "Import SKILL.md",
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      });
      if (!selected || Array.isArray(selected)) return;
      const content = await invoke<string>("read_file_content", { filePath: selected });
      setMarkdown(content);
      setSourcePath(selected);
      setPreview(null);
    } catch (reason) {
      setError(String(reason));
    }
  };

  const saveImportedSkill = () => {
    if (!markdown.trim()) {
      setError("SKILL.md chưa có nội dung.");
      return;
    }
    importSkill(markdown, sourcePath);
    setMarkdown("");
    setSourcePath(undefined);
    setError("");
  };

  const previewTemplate = (template: (typeof CODING_SKILL_TEMPLATES)[number]) => {
    setPreview({ ...template, key: `template:${template.name}`, kind: "template" });
  };

  const installPreview = () => {
    if (!preview || preview.kind !== "template") return;
    importSkill(preview.content, `template://${preview.name}/SKILL.md`);
    setPreview({ ...preview, key: `installed:${preview.name}`, kind: "installed" });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm" onMouseDown={onClose}>
      <section className="flex max-h-[86vh] w-full max-w-[900px] flex-col overflow-hidden rounded-2xl border border-[#33344a] bg-[#151522] shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-center gap-3 border-b border-[#2b2c40] px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mimoorange/15 text-mimoorange"><Sparkles size={19} /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-[#f0f1f7]">Application Skills</h2>
            <p className="mt-0.5 truncate text-[11px] text-[#777e96]">
              {currentProject ? `Áp dụng cho dự án ${currentProject.folder}` : "Skills dùng chung khi chưa mở dự án"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-[#777e96] hover:bg-[#252638] hover:text-white"><X size={17} /></button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[0.9fr_1.1fr] divide-x divide-[#2b2c40] overflow-hidden">
          <div className="overflow-y-auto p-4">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm Skills..." className="mb-3 w-full rounded-xl border border-[#303247] bg-[#10111a] px-3 py-2.5 text-[11px] text-[#d9dce7] outline-none placeholder:text-[#626980] focus:border-mimoorange" />
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8d93a9]">Đã cài đặt ({visibleSkills.length})</span>
              <button onClick={pickSkillFile} className="flex items-center gap-1.5 rounded-lg bg-mimoorange px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-orange-500">
                <FileDown size={13} /> Import
              </button>
            </div>
            <div className="space-y-2">
              {visibleSkills.map((skill) => (
                <article
                  key={skill.id}
                  onClick={() => setPreview({ key: skill.id, name: skill.name, description: skill.description, content: skill.content, kind: "installed" })}
                  className={`cursor-pointer rounded-xl border p-3 transition-colors ${preview?.key === skill.id ? "border-mimoorange/70 bg-mimoorange-soft" : "border-[#303247] bg-[#1b1c2a] hover:border-[#45485f]"}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-[#eceef5]">#{skill.name}</div>
                      <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#7f869e]">{skill.description}</p>
                    </div>
                    <button onClick={(event) => { event.stopPropagation(); toggleSkill(skill.id); }} title={skill.enabled ? "Tắt skill" : "Bật skill"} className={`rounded-lg p-1.5 ${skill.enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-[#27293a] text-[#666d85]"}`}>
                      <Power size={14} />
                    </button>
                    <button onClick={(event) => { event.stopPropagation(); removeSkill(skill.id); if (preview?.key === skill.id) setPreview(null); }} title="Xóa skill" className="rounded-lg p-1.5 text-[#666d85] hover:bg-rose-500/10 hover:text-rose-400"><Trash2 size={14} /></button>
                  </div>
                </article>
              ))}
              {visibleSkills.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#34364b] px-5 py-8 text-center text-[11px] leading-5 text-[#6e758d]">
                  Chưa có Skill nào. Import một tệp SKILL.md hoặc dán Markdown ở bên phải.
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col p-4">
            <div className="mb-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#8d93a9]">Mẫu coding tối ưu</div>
              <div className="grid grid-cols-2 gap-1.5">
                {CODING_SKILL_TEMPLATES.map((template) => (
                  <button
                    key={template.name}
                    onClick={() => previewTemplate(template)}
                    className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${preview?.key === `template:${template.name}` ? "border-mimoorange/70 bg-mimoorange-soft" : "border-[#303247] bg-[#1b1c2a] hover:border-mimoorange/50 hover:bg-mimoorange-soft"}`}
                    title={template.description}
                  >
                    <span className="block truncate text-[10px] font-medium text-[#dfe2eb]">#{template.name}</span>
                    <span className="mt-0.5 block truncate text-[9px] text-[#6f768e]">{template.description}</span>
                  </button>
                ))}
              </div>
            </div>
            {preview ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#303247] bg-[#10111a]">
                <div className="flex items-start gap-3 border-b border-[#303247] bg-[#191a27] px-3.5 py-3">
                  <BookOpen size={16} className="mt-0.5 shrink-0 text-mimoorange" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-[#eef0f6]">#{preview.name}</div>
                    <p className="mt-0.5 text-[10px] leading-4 text-[#7f869e]">{preview.description}</p>
                  </div>
                  <button onClick={() => setPreview(null)} className="rounded-lg p-1.5 text-[#777e96] hover:bg-[#292b3d] hover:text-white" title="Đóng xem trước"><X size={14} /></button>
                </div>
                <CodeContextMenu text={preview.content} className="min-h-0 flex-1 overflow-hidden">
                  <pre className="code-scroll h-full overflow-auto whitespace-pre-wrap break-words p-3.5 font-mono text-[10px] leading-5 text-[#cfd3df]">{preview.content}</pre>
                </CodeContextMenu>
                <div className="flex items-center justify-between gap-2 border-t border-[#303247] bg-[#151620] px-3 py-2.5">
                  <span className="text-[9px] text-[#697088]">{preview.kind === "template" ? "Mẫu có sẵn · xem trước trước khi thêm" : "Skill đã cài đặt"}</span>
                  {preview.kind === "template" && (
                    <button onClick={installPreview} className="flex items-center gap-1.5 rounded-lg bg-mimoorange px-3 py-1.5 text-[10px] font-medium text-white hover:bg-orange-500">
                      <Plus size={13} /> Thêm Skill
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#8d93a9]">Import Markdown</div>
                {sourcePath && <div className="mb-2 truncate rounded-lg bg-[#202132] px-2.5 py-2 font-mono text-[10px] text-[#8f96ad]">{sourcePath}</div>}
                <textarea
                  value={markdown}
                  onChange={(event) => { setMarkdown(event.target.value); setSourcePath(undefined); }}
                  placeholder={'---\nname: code-review\ndescription: Review mã nguồn\n---\n\n# Instructions\n...'}
                  spellCheck={false}
                  className="min-h-[210px] flex-1 resize-none rounded-xl border border-[#303247] bg-[#10111a] p-3 font-mono text-[11px] leading-5 text-[#cfd3df] outline-none focus:border-mimoorange"
                />
                {error && <p className="mt-2 text-[10px] text-rose-400">{error}</p>}
                <button onClick={saveImportedSkill} className="mt-3 rounded-xl bg-[#292b3d] px-4 py-2.5 text-[12px] font-medium text-white hover:bg-[#34374d]">Lưu Skill</button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
