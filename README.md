# LvAIgent — MiMo Desktop

**LvAIgent** là ứng dụng desktop AI coding assistant hoạt động local-first, được xây dựng trên **Tauri v2** với frontend **React + TypeScript** và backend **Rust**. Ứng dụng tích hợp runtime **MiMo-Code** (Xiaomi) để tương tác với các mô hình AI ngay trên máy, không cần kết nối cloud.

![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131?logo=tauri)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![Rust](https://img.shields.io/badge/Rust-2021-000000?logo=rust)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss)

---

## Tính năng chính

### 💬 Chat với AI
- Gửi tin nhắn đến mô hình AI qua MiMo-Code runtime
- Hỗ trợ streaming, đánh dấu markdown, code highlighting
- Đính kèm file và thư mục vào ngữ cảnh chat
- Lịch sử chat được lưu tự động (JSON)

### 📁 Quản lý dự án
- Mở project từ máy, duyệt cây thư mục
- Xem nội dung file, so sánh thay đổi (diff)
- Theo dõi thay đổi trong workspace
- Quản lý nhiều workspace

### 🤖 Agent Mode
- Chế độ tự động: AI đọc/ghi file, tìm kiếm code, chạy lệnh shell
- Tích hợp LSP để phân tích code
- Theo dõi tiến trình tác vụ real-time

### 🎙️ PiP Voice Player
- Phát giọng nói TTS ở chế độ Picture-in-Picture
- Điều khiển phát/tạm dừng, tua, điều chỉnh tốc độ
- Hoạt động trên mọi cửa sổ

### 🌐 Dịch phụ đề SRT
- Dịch file phụ đề SRT bằng AI (giữ nguyên định dạng gốc)

---

## Công nghệ sử dụng

| Layer | Công nghệ |
|-------|-----------|
| **Desktop Shell** | Tauri v2 (Rust) |
| **Frontend** | React 18 + TypeScript + Vite 6 |
| **State Management** | Zustand |
| **Styling** | Tailwind CSS 3 + `@tailwindcss/typography` |
| **AI Runtime** | MiMo-Code CLI (`mimo.exe`) — local-first |
| **Icons** | lucide-react |
| **Markdown** | react-markdown + remark-gfm |
| **Python Bridge** | gemini-webapi (tuỳ chọn, cho Gemini API) |
| **Packaging** | NSIS (Windows installer) |

---

## Yêu cầu hệ thống

- **OS:** Windows 10/11 64-bit
- **Node.js** >= 18
- **Rust toolchain** (nếu build từ source)
- **FFmpeg** (tuỳ chọn, để render video quảng bá)
- **Python 3.10+** (tuỳ chọn, cho Gemini bridge)

---

## Cài đặt & Phát triển

### Yêu cầu

```bash
# Node.js
winget install OpenJS.NodeJS.LTS

# Rust toolchain
winget install Rustlang.Rustup
```

### Clone & cài dependencies

```bash
git clone https://github.com/your-username/lvaigent-desktop.git
cd lvaigent-desktop

npm install
```

### Chạy ở chế độ dev

```bash
npm run tauri dev
```

Frontend hot-reload tại `http://localhost:1420`.

### Build bản phân phối

```bash
npm run tauri build
```

File cài đặt `.exe` (NSIS) sẽ được tạo trong `src-tauri/target/release/bundle/nsis/`.

---

## Cấu trúc thư mục

```
lvaigent-desktop/
├── src/                    # Frontend React
│   ├── components/         # UI components
│   ├── App.tsx             # Root component
│   ├── store.ts            # Zustand store
│   └── types.ts            # Type definitions
├── src-tauri/              # Backend Rust
│   ├── src/lib.rs          # Tauri commands
│   └── tauri.conf.json     # Tauri config
├── vendor/
│   └── mimo-runtime/       # MiMo-Code CLI runtime
├── workspaces/             # Workspace data
└── assets/                 # Video rendering assets
```

---

## Scripts hữu ích

| Lệnh | Mô tả |
|------|-------|
| `npm run dev` | Chạy Vite dev server |
| `npm run build` | Build frontend (TypeScript + Vite) |
| `npm run tauri dev` | Chạy Tauri app (dev mode) |
| `npm run tauri build` | Build app distribution |
| `npm run preview` | Preview production build |

---

## Giấy phép

Dự án này sử dụng **MiMo-Code** (Xiaomi) — xem [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) để biết thông tin giấy phép của bên thứ ba.

