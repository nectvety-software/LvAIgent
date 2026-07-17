import { invoke } from "@tauri-apps/api/core";
import type { Message } from "./types";
import { useStore } from "./store";

export function findBestVoice(lang: string, preferredName?: string): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  // If a specific voice name is provided, try to match it
  if (preferredName) {
    const exact = voices.find((v) =>
      v.name.toLowerCase().includes(preferredName.toLowerCase())
    );
    if (exact) return exact;
  }
  // Prefer Google voices for the given language
  const googleVoice = voices.find(
    (v) => v.lang.startsWith(lang.split("-")[0]) && v.name.includes("Google")
  );
  if (googleVoice) return googleVoice;
  // Fallback: any voice matching the language
  const langVoice = voices.find((v) => v.lang.startsWith(lang.split("-")[0]));
  if (langVoice) return langVoice;
  // Last resort: default
  return null;
}

export function messagesToMarkdown(messages: Message[]): string {
  let md = "# Cuộc trò chuyện\n\n";
  for (const m of messages) {
    if (m.role === "user") {
      md += `## Người dùng\n\n${m.content}\n\n`;
    } else if (m.role === "assistant") {
      md += `## MiMo\n\n${m.content}\n\n`;
    }
  }
  return md.trim() + "\n";
}

export async function saveToDownloads(
  content: string,
  filename: string
): Promise<string> {
  try {
    const path = await invoke<string>("save_file", { filename, content });
    useStore.getState().setToast({ type: "success", path });
    return path;
  } catch {
    // Fallback: browser download via blob
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    useStore.getState().setToast({ type: "error", message: "Không thể lưu vào thư mục downloads" });
    return filename;
  }
}

export function downloadMarkdown(messages: Message[], filename?: string): void {
  const content = messagesToMarkdown(messages);
  saveToDownloads(content, filename || `cuoc-tro-chuyen-${Date.now()}.md`);
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "")
    .replace(/(\*|_){1,3}([^*_]+)\1{1,3}/g, "$2")
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ""))
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/>\s+/g, "")
    .replace(/[-*+]\s+/g, "")
    .replace(/\d+\.\s+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function exportAsDoc(text: string, filename = "mimo-response"): void {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>LvAIgent Response</title>
<style>body{font-family:sans-serif;max-width:800px;margin:auto;padding:2em;line-height:1.6}</style>
</head><body>${text.replace(/\n/g, "<br>")}</body></html>`;
  saveToDownloads(html, `${filename}.html`);
}
