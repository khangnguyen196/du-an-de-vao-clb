# Data model

```
users              (Supabase auth.users)
sources            id, kind: youtube|ted|upload, external_id, url, title,
                   duration_s, lang, thumbnail_url, created_by
transcripts        id, source_id, lang, origin: captions|whisper|manual,
                   status: pending|processing|ready|failed, full_text
cues               id, transcript_id, idx, start_ms, end_ms, text, speaker,
                   translation? (text), translation_origin? (ted|model)
                   -- đơn vị nhỏ nhất; mọi thứ khác tham chiếu tới cue
notes              id, user_id, source_id, cue_id?, body, created_at
summaries          id, transcript_id, kind: tldr|outline|key_points,
                   content_json, model, created_at
decks              id, user_id, source_id?, title
cards              id, deck_id, front, back, senses (jsonb — [{meaning_vi,
                   part_of_speech, is_common, in_transcript, example{en,vi}}]),
                   single_common_sense, cue_id?, srs_state (jsonb — nguyên
                   Card của ts-fsrs, ngày dạng ISO), srs_due_at (tách riêng để
                   query thẻ đến hạn), first_reviewed_at (giới hạn thẻ mới/ngày)
card_notes         id, user_id, card_id, senses (jsonb — [{meaning_vi,
                   part_of_speech, in_transcript, example{en,vi}}]), updated_at
                   -- ghi chú người học; tách khỏi cards vì cards bị làm mới
                   -- mỗi lần mở bộ thẻ. RLS theo user_id.
quiz_attempts      id, user_id, deck_id, score, answers_json
usage_events       id, user_id?, anon_id?, kind, cost_tokens, created_at
```

Quy tắc:
- **`cues` là bảng nóng nhất.** Index `(transcript_id, start_ms)`. Không bao giờ `SELECT *` toàn bộ cues rồi filter ở JS cho video dài.
- Cache transcript theo `(source.external_id, lang)` — cùng một video, nhiều người xem, chỉ fetch/transcribe **một lần**.
- Bật **RLS** trên mọi bảng có `user_id`. Viết policy cùng lúc với migration, không để sau.
- `summaries`, `cards` sinh từ AI phải lưu `model` + `cue_id` nguồn để trace.
