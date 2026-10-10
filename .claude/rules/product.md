# Sản phẩm & phạm vi

**abc** — web app biến video/audio thành tài liệu học tập.

Phạm vi: **chỉ là web app**. Không làm Chrome extension, không làm mobile app native — nếu cần dùng trên điện thoại thì làm responsive/PWA. Đừng đề xuất hai thứ đó.

**Toàn bộ tính năng miễn phí, không có gói trả phí.** Không có Stripe, không có paywall, không có nút "Upgrade". Giới hạn duy nhất là chống lạm dụng — xem `limits.md`.

Luồng chính (core loop):

```
Dán link TED (upload audio/video sẽ có ở M5)
  → lấy/tạo transcript có timestamp
  → đọc transcript song song với video player
  → AI: tóm tắt, dịch, hỏi đáp trên nội dung
  → rút từ vựng / key points → flashcard + quiz
  → lưu vào Notebook, ôn lại, export
```

Hai lớp:

| Lớp | Nội dung |
|---|---|
| **Core (P0)** | Ingest link/file, transcript + timestamp, player đồng bộ, search trong transcript, export TXT/SRT/VTT/MD |
| **Study (P1)** | Tóm tắt AI, dịch, AI chat trên transcript, flashcard, quiz, Notebook, spaced repetition |

Nguyên tắc sản phẩm:
- Transcript là **nguồn sự thật duy nhất**. Mọi tính năng học tập (summary, flashcard, quiz, chat) đều phải trace ngược được về đoạn transcript gốc + timestamp. Không bao giờ sinh nội dung "trôi nổi" không có nguồn.
- Click vào một câu → video nhảy đúng giây đó là tính năng ký của loại app này. **Có với TED** khi phát luồng HLS của TED trong player riêng (xem `ingest.md`): câu đang nói được tô sáng theo vị trí thật của `<video>`, bấm câu để tua. Player nhúng chính thức của TED không báo vị trí (đã thử, kể cả handshake postMessage), nên khi phải lùi về nó thì transcript chỉ để đọc/tìm/xuất. Tuyệt đối không làm highlight đoán mò để lấp chỗ trống — nó sẽ lệch dần và tệ hơn là không có.
- Người dùng chưa đăng nhập vẫn phải xem được transcript của 1 video (giới hạn quota) — đăng nhập chỉ cần khi lưu/Notebook.
