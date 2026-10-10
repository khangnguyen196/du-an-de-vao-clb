# Tech stack

- **Next.js 15** (App Router, React Server Components) + **TypeScript** (strict)
- **Tailwind CSS** + **shadcn/ui** (Radix). Không thêm UI lib khác.
- **Supabase**: Postgres + Auth + Storage + Row Level Security
- **Drizzle ORM** cho query có type (không dùng raw SQL rải rác trong route)
- **Vercel** deploy; **Vercel AI SDK** (`ai` package) cho streaming LLM
- **Anthropic Claude** cho tác vụ AI (model mặc định: `claude-sonnet-5`)
- **Whisper** (OpenAI API hoặc self-host) chỉ cho file upload không có sẵn phụ đề. Hiện có bản self-host chạy trên máy chủ dự án: **faster-whisper** 1.1.1 (MIT, Python, ghim trong `scripts/whisper/requirements.txt`) + model `small.en` (MIT) cho bài TED chưa có transcript. Không phải dependency của web app, không lên Vercel
- **Zod** cho mọi validation biên (form, API input, LLM structured output) — kể cả dữ liệu đọc từ localStorage
- **ts-fsrs** (bản ghim 5.4.2, MIT, không kéo dependency) cho ôn tập ngắt quãng. Kiểu `Card`/`Grade` import thẳng từ thư viện
- **hls.js** (bản ghim 1.7.3, Apache-2.0, không kéo dependency) để phát luồng HLS MPEG-TS của TED trên Chrome/Edge/Firefox. Chỉ `import()` động trong `components/player/TedPlayer.tsx`
- **Vitest** (unit) + **Playwright** (e2e)

Không thêm dependency mới nếu stack trên đã giải quyết được. Nếu cần thêm, nêu lý do trước khi cài.
