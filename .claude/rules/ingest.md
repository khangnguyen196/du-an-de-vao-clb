# Ingest transcript

**YouTube đã bị loại khỏi phạm vi.** YouTube trả về HTTP 200 với body rỗng cho mọi caption URL trừ khi request kèm proof-of-origin token sinh từ mã chống bot của chính họ — máy chủ không tạo được. Đã đo và loại từng đường: baseUrl từ watch page (json3/srv3/mặc định), thêm Referer/Origin, innertube `player` với client ANDROID/IOS/TVHTML5, innertube `player` với API key của chính trang, và `get_transcript`. Không đường nào trả về cue.

Không đi vòng qua rào đó. Đừng viết lại fetcher YouTube trừ khi tôi yêu cầu rõ.

**Link YouTube của bài TED → bài trên ted.com (đã có, 2026-10-11).** Không đọc gì của YouTube ngoài tiêu đề + tên kênh qua **oEmbed** (endpoint công khai, chính thức). Không phụ đề, không media, không watch page.
- `lib/ingest/youtube-url.ts`: nhận diện + lấy mã video (`parseYouTubeVideoId`). Mã trần 11 ký tự toàn chữ thường bị coi là tìm tên bài, không phải mã.
- `lib/ingest/youtube-ted.ts`: từ tiêu đề đoán tối đa 4 slug (`slugCandidates`: "Tên bài | Diễn giả | TED", "Tên bài | Diễn giả", "Diễn giả: Tên bài", hai diễn giả thử cả hai thứ tự), rồi **chỉ nhận slug nào mà trang TED ghi đúng mã YouTube đó** (`videoData.videoPlayerData.external.code`, giữ lại trong `trimPageProps`; khoá cache `ted-page-props-v2`). Đoán sai chỉ tốn một request, không bao giờ mở nhầm bài.
- Kênh ngoài họ TED thì không gọi TED. Slug không tồn tại = trượt, thử slug sau; lỗi TED khác (chặn, quá tải) thì ném lên, không báo "không tìm thấy".
- Đo 33 bài: oEmbed trả về mọi video công khai (403 = video riêng tư); đoán trúng ~11/14. Trượt khi YouTube đổi hẳn tiêu đề (vd. bài của Ari Matusiak) → trang `/watch/youtube/[id]` báo rõ, có nút "Tìm trên TED" cho người dùng tự bấm. Trang tìm kiếm và `/graphql` của TED bị `robots.txt` cấm — **không** gọi chúng từ server. Sitemap của TED thiếu bài, không có mã YouTube.
- Bài **TEDx** chỉ có trên YouTube: không lấy được transcript. Không tải audio YouTube để chạy Whisper (vi phạm ToS YouTube + phải vượt rào chống bot).

Thứ tự thử, dừng ở bước đầu tiên thành công:

1. **Transcript có sẵn** của nền tảng (TED nhúng thẳng trong `__NEXT_DATA__` của trang talk — một request được cả metadata lẫn cue, và `time` vốn đã là milliseconds) — nhanh, rẻ, chính xác nhất.
2. **Phụ đề auto-generated** — có sẵn nhưng chất lượng thấp hơn, đánh dấu `origin: captions` + flag `auto`.
3. **Whisper** — chỉ khi 1 và 2 đều không có, hoặc user upload file. Đây là bước **tốn tiền và chậm**: bắt buộc chạy async qua job, không chạy trong request.

**Whisper chạy trên máy chủ dự án (đã có, 2026-10-10)** — cho bài TED mới đăng chưa có transcript (TED thường đăng transcript sau vài ngày tới vài tuần):
- `npm run transcribe:setup` (một lần: venv Python + `faster-whisper` 1.1.1 trong `.tools/whisper/`, model `small.en` tải về `.tools/whisper/models/`), rồi `npm run transcribe -- <link|slug>`. Chạy CPU, int8. Không cần key, không tốn tiền, không chạy trên Vercel.
- Chỉ lấy **bản âm thanh** trong luồng HLS (`lib/ingest/hls-audio.ts` chọn rendition audio mono, lùi về variant bitrate thấp nhất nếu audio ghép chung video), chỉ từ host của TED, tải vào `.cache/transcribe/<slug>/` rồi **xoá ngay khi chạy xong**. Đây là ngoại lệ chủ dự án đã duyệt cho quy tắc "không tải về": giữ tạm trên máy, không lưu lâu, không đưa lên đâu.
- Lấy mốc **theo từng từ** (`word_timestamps`), cắt câu ở dấu chấm/khoảng lặng (`wordsToSegments`) rồi qua `normalizeCues` như transcript TED. Mốc theo segment của Whisper trôi cả giây — đừng dùng.
- Lưu `data/transcripts/ted/<slug>.<lang>.json` (`lib/ingest/transcript-store.ts`), gắn đường dẫn luồng + độ dài video: TED thay video thì file bị bỏ qua. App chỉ đọc file khi trang TED **không có** transcript — TED đăng bản chính thức là tự chuyển sang. Truyền vào `fetchTedTranscript` qua `storedTranscript` vì `ted.ts` cũng bị bundle cho trình duyệt, không được import `node:fs`.
- `origin: 'whisper'`, UI ghi "Transcript máy", trang gắn `noindex`, không lên git (giống bản dịch máy).
- `--compare` chạy trên bài **đã có** transcript TED để đo tỷ lệ sai từ và độ lệch mốc đầu câu; không lưu gì.

Xử lý bất đồng bộ:
- `POST /api/transcript` trả về ngay `{ transcriptId, status: 'pending' }`.
- Client poll hoặc subscribe Supabase Realtime trên row `transcripts`.
- Job dài chạy trên Vercel background function / queue, có timeout và retry với backoff.
- Trạng thái `failed` phải kèm `error_code` đọc được để UI hiển thị đúng lý do (video private, không có phụ đề, file quá dài...).

Bản dịch dưới từng dòng (`lib/ingest/align.ts`):
- Nguồn: bản dịch người của TED (`?language=vi`), lấy song song với bản gốc. Model dịch dự phòng thuộc giai đoạn sau, cần key.
- **Bắt buộc kiểm tra mã ngôn ngữ trả về** (`extractTranslation`). Hỏi ngôn ngữ bài không có, TED không báo lỗi: mã lạ thì 307 về trang tiếng Anh, mã có thật mà bài chưa dịch thì trả trang với `translation: null`. Bỏ qua bước này là hiện tiếng Anh dưới tiếng Anh mà gắn nhãn bản dịch.
- Bản vi không cắt dòng giống bản en (khác số dòng, giờ bắt đầu lệch ~0,5s điển hình, tối đa ~2,5s) → **không ghép theo chỉ số**. Mỗi mảnh gán vào câu en chứa điểm giữa thời gian của nó; mảnh chỉ được di chuyển nguyên khối và nối bằng dấu cách, không cắt hay sửa lời người dịch.
- Đo trên 3 bài: 99–100% dòng có bản dịch, 2/561 dòng có tỷ lệ độ dài vi/en bất thường. Đây là chỉ báo gián tiếp, không phải kiểm tra nghĩa — mảnh nằm ở ranh giới câu vẫn có thể lệch một dòng.
- Lỗi khi lấy bản dịch không bao giờ được làm mất transcript gốc: mọi lỗi phía bản dịch quy về "không có bản dịch".
- Ghi công theo link profile TED; TED thường trả `fullName: null` → để `name: null`, không đoán tên.

Chuẩn hoá (`lib/ingest/normalize.ts`): mọi nguồn đều đổ về cùng shape `Cue[]`. Gộp cue vụn thành câu hoàn chỉnh, bỏ tag `[Music]`/`[Applause]` (cả ngoặc vuông lẫn ngoặc tròn — TED viết `(Laughter)`, bản tiếng Việt viết `(Cười lớn)`, `(Vỗ tay)`), trim khoảng trắng, giữ nguyên timestamp gốc của cue đầu.

**Pháp lý:** chỉ lấy phụ đề công khai, tôn trọng ToS nền tảng và robots.txt. Không lưu file media gốc của bên thứ ba lên Storage — chỉ lưu transcript và metadata.

**Phát video TED (quyết định của chủ dự án, 2026-10-10):** phát luồng HLS của chính TED trong `<video>` của app (`components/player/TedPlayer.tsx`), phát thẳng từ `hls.ted.com`, không tải về, không proxy. Đây là bỏ qua player chính thức của TED — chủ dự án đã chấp nhận và tự chịu trách nhiệm về điều khoản. Player nhúng chính thức chỉ còn là đường lùi (không có luồng, trình duyệt không phát được, luồng lỗi).
- Link lấy từ `videoData.hlsUrl`, **bỏ `intro_master_id`** (`tedStreamUrl`): tham số đó ghép 3,5 s logo TED vào đầu, còn mốc cue tính từ đầu bài nói. Đã đo onset lời nói trên 4 bài: lệch 0–0,4 s so với cue đầu.
- File MP4 "fallback" trong `videoPlayerData.resources.h264` trả 403 với mọi request — đừng thử lại đường đó.
- Segment của TED là MPEG-TS: Chrome/Edge/Firefox không phát native (Chrome còn trả `canPlayType` = "maybe" rồi lỗi format). Dùng hls.js khi có MediaSource; HLS native chỉ cho iPhone đời cũ. Với file người dùng upload, lưu trong bucket private, RLS theo `user_id`, có TTL xoá.
