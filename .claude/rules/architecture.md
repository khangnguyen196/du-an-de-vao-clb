# Cấu trúc thư mục

```
app/
  (marketing)/           # landing, pricing, blog — public, static
  (app)/
    dashboard/
    watch/ted/[slug]/    # màn hình chính: player + transcript
    notebook/
    watch/ted/[slug]/vocab/  # flashcard từ vựng + đánh giá 4 mức
    review/              # hàng đợi ôn tập gom từ mọi bài (client, đọc localStorage)
  api/
    transcript/route.ts  # POST: ingest link → job
    ai/summarize/route.ts
    ai/chat/route.ts     # streaming
components/
  ui/                    # shadcn — chỉ sửa qua CLI, không tự chế
  transcript/            # TranscriptPane, Cue, SearchBar
  player/                # TedPlayer (HLS của TED qua hls.js, lùi về embed), usePlaybackSync
  study/                 # FlashcardDeck, FlipCard, RatingBar, ReviewSession, NoteEditor
lib/
  db/schema.ts           # Drizzle schema — nguồn sự thật của DB
  db/queries/            # mọi truy vấn DB nằm ở đây, không nằm trong component
  ingest/                # ted.ts, align.ts, resolve.ts, normalize.ts, upload.ts (M5)
  ai/                    # prompts.ts, vocabulary.ts, summarize.ts, chat.ts
  study/                 # candidates.ts, wordlists.ts, inflect.ts, vocab-set.ts,
                         # srs.ts (engine thuần, now truyền vào), srs-store.ts
                         # (interface + localStorage), use-review.ts (hook client),
                         # notes-store.ts (ghi chú người học + validateNote),
                         # card-content.ts (ghép ghi chú + nghĩa model), use-notes.ts,
                         # keyboard.ts (chặn phím tắt khi đang gõ / nút đang focus)
  supabase/              # client.ts (browser), server.ts (RSC/route)
types/
supabase/migrations/
```
