# Lệnh & điều kiện hoàn thành

```bash
npm run dev          # dev server (turbopack)
npm run build        # production build — chạy trước khi báo "xong"
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run test         # vitest
npm run test:e2e     # playwright
npm run translate:prepare -- <slug>  # agent dịch: chia lô (xem ai.md)
npm run translate:save -- <slug>     # agent dịch: kiểm tra + lưu
npm run transcribe:setup             # một lần: Python env + faster-whisper vào .tools/whisper
npm run transcribe -- <slug>         # Whisper cho bài TED chưa có transcript (xem ingest.md)
npm run transcribe -- <slug> --compare  # đo Whisper so với transcript TED, không lưu
npm run align -- <slug>              # mốc từng từ (chữ sáng theo lời) — dùng lại lần chạy Whisper cũ nếu có
npm run db:generate  # sinh migration từ schema Drizzle (vào supabase/migrations)
npm run db:migrate   # apply migration
npm run db:studio    # drizzle studio
```

**Trước khi báo hoàn thành bất kỳ task code nào: chạy `npm run typecheck && npm run lint && npm run build`.** Nếu fail thì chưa xong.
