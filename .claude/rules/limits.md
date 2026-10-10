# Giới hạn & chống lạm dụng

Không có gói trả phí. Nhưng Whisper và LLM tốn tiền thật, nên vẫn phải có rào — mục đích là **chặn bot/abuse**, không phải ép người dùng nâng cấp.

- **Anonymous** (chưa đăng nhập): xem được transcript, export cơ bản. Rate limit theo `anon_id` cookie + IP. Không gọi được Whisper (upload) — bước đó bắt buộc đăng nhập.
- **Đã đăng nhập**: mở toàn bộ tính năng. Rate limit rộng tay theo `user_id`, chỉ đủ để chặn script cào.
- Giới hạn kỹ thuật, không phải giới hạn thương mại: độ dài file upload tối đa, số job async chạy đồng thời mỗi user, số request/phút.
- Kiểm tra **ở server trước khi tốn tiền** (trước khi gọi Whisper/LLM), không chỉ ẩn nút ở UI.
- Khi chạm giới hạn: thông báo trung thực ("đang xử lý quá nhiều video cùng lúc, thử lại sau X phút"). **Không** hiện gợi ý trả phí — không có gì để bán.
- `usage_events` vẫn ghi đầy đủ, nhưng để **tôi theo dõi chi phí hạ tầng**, không để tính tiền người dùng.

## Đã có (M6 phần chống lạm dụng, 2026-10-10)

- **Bộ đệm bền dữ liệu TED** (`fetchTedPageProps` trong `lib/ingest/ted.ts`): `unstable_cache` 24 giờ, dùng chung mọi instance trên Vercel, chỉ giữ phần app đọc (`trimPageProps`). Lỗi không bao giờ được cache. Ngoài Next (script agent, test) thì gọi TED trực tiếp.
- **Tối đa 4 request TED song song mỗi instance**, hàng chờ tối đa 40, quá thì `RATE_LIMITED` ngay.
- **Giới hạn theo IP** (`lib/limits/guard.ts`): 35 bài **khác nhau** / 10 phút (`TALK_LIMIT`) cho trang xem bài, trang Từ vựng và cả `generateMetadata` (nó cũng tải transcript). Mở lại bài đã tính không tốn lượt. Lượt gọi model: 3 bài / giờ (`MODEL_LIMIT`), hỏi ngay trước khi chạy model — bản dịch đã lưu, cache, hay đang chạy dở không tốn lượt.
- Bộ đếm nằm trong bộ nhớ từng instance → rào "cố gắng hết mức", không tuyệt đối. Rào bền cần DB (M2) hoặc Redis.
- `/api/transcript` **tắt ở production** (404) trừ khi đặt `ENABLE_TRANSCRIPT_API=1`; khi bật vẫn qua giới hạn IP và trả `Retry-After`.
- IP lấy theo `x-vercel-forwarded-for` → `x-real-ip` → mục đầu của `x-forwarded-for` (`clientAddress`).
- Chưa làm: `usage_events` (cần DB), landing page, SEO.
