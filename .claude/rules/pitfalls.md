# Cạm bẫy đã biết

- **Sync player ↔ transcript** (`components/player/usePlaybackSync.ts`): `requestAnimationFrame` + binary search (`findActiveCueIndex` trong `lib/cues.ts`) trên mảng cues theo `start_ms`, không `setInterval` + `.find()` tuyến tính. Bài nói dài có thể có 3000+ cues. Khi pause/seek vẫn cập nhật qua sự kiện `pause`/`seeked`.
- **Auto-scroll transcript** phải tắt ngay khi user tự scroll, và hiện nút "trở về vị trí hiện tại". Auto-scroll cưỡng bức là lỗi UX kinh điển của app dạng này. Chỉ coi input của người đọc (wheel, touchmove, phím cuộn, kéo scrollbar) là "tự scroll" — sự kiện `scroll` do chính `scrollToIndex` gây ra không được tắt chế độ theo dõi.
- Virtualize danh sách cues (`@tanstack/react-virtual`) khi > 500 cue.
- Player chỉ tồn tại ở client (chọn hls.js / HLS native / embed phụ thuộc trình duyệt) → wrap trong dynamic import `ssr: false`, và hls.js chỉ `import()` trong `TedPlayer`.
- Dòng transcript là `<button>` khi player tua được → bên trong chỉ dùng `<span>` (block), không `<p>`/`<div>`: button chỉ chứa phrasing content.
- Đừng chạy `next build` khi `next dev` đang chạy: cả hai dùng chung `.next`, build sẽ xoá state của dev server và gây lỗi ENOENT khó hiểu.
- **Sửa `messages/*.json` xong phải khởi động lại `next dev`.** `i18n/request.ts` nạp chuỗi bằng `import()` động theo locale; turbopack giữ bản cũ, nên khoá mới hiện thành `vocab.openQuiz` và log `MISSING_MESSAGE` dù file đã đúng.
- **Không gọi API server của next-intl (`getTranslations`) trong `generateImageMetadata`.** Nó chạy ở ngữ cảnh next-intl coi là client, ném lỗi — và lỗi đó làm mất `<title>`, description, canonical, og của **mọi trang**, không chỉ ảnh. Dùng `export const alt` tĩnh lấy từ `messages/vi.json`.
- **Đừng kiểm tra trang bằng cách tìm một câu thông báo trong HTML.** `NextIntlClientProvider` gửi **toàn bộ** chuỗi giao diện xuống mọi trang, nên câu báo lỗi luôn có trong HTML dù trang không lỗi. Tìm dấu hiệu chỉ trang đó render (ví dụ mã lỗi `>RATE_LIMITED<` trong `TranscriptError`), hoặc gọi API JSON.
- **Khi verify bằng Browser pane:** nếu khung bị ẩn/không được vẽ thì `innerWidth` = 0 và `requestAnimationFrame` không chạy. Hậu quả: chữ xuống dòng từng ký tự (dòng cao hàng nghìn px), và virtualizer không cập nhật danh sách dòng sau khi cuộn. Đừng coi đó là bug. Đặt viewport giả lập bằng `resize_window` trước khi đo, và kiểm tra thứ gì phụ thuộc rAF trên phần tử đã được vẽ sẵn.
- **`temperature` trên `claude-sonnet-5` là lỗi 400.** Code từ vựng cũ từng truyền `temperature: 0.2` và chưa ai phát hiện vì chưa gọi thật lần nào. Code AI chưa chạy với key thật thì coi như chưa kiểm chứng.
- Snapshot ôn tập có mảng (senses): so sánh bằng `===` sẽ luôn "khác" → effect ghi danh ghi lại mãi. Dùng so sánh sâu, không phụ thuộc thứ tự khoá (`deepEqual` trong `lib/study/srs.ts`).
- Phím tắt toàn trang (Space lật, 1–4 chấm) phải qua `shouldIgnoreShortcut` (`lib/study/keyboard.ts`): bỏ qua khi đang gõ, và Space nhường cho nút đang focus — nếu không, gõ ghi chú sẽ lật/chấm thẻ, và Space trên nút "Lưu" sẽ lật thẻ thay vì lưu.
- Supabase server client phải tạo mới mỗi request (đọc cookie), **không** để module-level singleton.
- Timezone: lưu `timestamptz`, hiển thị theo locale người dùng.
