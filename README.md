# Dự Án để vào clb

Web app học tiếng Anh qua bài nói TED: xem video với transcript tô sáng theo từng câu, bản dịch tiếng Việt dưới mỗi dòng, rồi biến từ mới thành thẻ ôn tập và quiz.

**Demo:** https://ww-nu-lyart.vercel.app

Miễn phí, không cần đăng ký. Dữ liệu học (sổ từ, tiến độ ôn, quiz) lưu ngay trên trình duyệt của mỗi người.

## Tính năng

**Đọc và nghe**
- Dán link một bài nói trên ted.com, hoặc chọn một trong 8 bài mẫu.
- Transcript chạy theo video: câu đang nói được tô sáng, bấm vào câu nào video nhảy tới câu đó. Tự cuộn đọc trước thì không bị kéo lại.
- Song ngữ từng dòng với bản dịch tiếng Việt của cộng đồng TED. Bài chưa có bản dịch thì dịch ngay trên trình duyệt bằng Translator API của Chrome.
- Tìm trong lời nói, xuất ra TXT, SRT, VTT hoặc Markdown.

**Học từ vựng**
- Thẻ từ và cụm từ rút thẳng từ bài nói, mỗi thẻ kèm đúng câu diễn giả đã nói và mốc thời gian.
- Sổ từ: chỉ lưu những từ bạn muốn nhớ, tự viết nghĩa và ví dụ.
- Ôn tập ngắt quãng theo thuật toán FSRS.
- Quiz bốn dạng: điền vào câu gốc, nghĩa sang từ, từ sang nghĩa, gõ lại từ.

**Vận hành**
- Bộ đệm dữ liệu TED 24 giờ, giới hạn số bài mở theo IP để chống lạm dụng.
- SEO: transcript có sẵn trong HTML, ảnh xem trước riêng cho từng bài, sitemap và robots.txt.

## Công nghệ

- [Next.js 15](https://nextjs.org) (App Router) + React 19 + TypeScript
- Tailwind CSS 4, next-intl (tiếng Việt / tiếng Anh)
- hls.js để phát luồng video của TED, @tanstack/react-virtual cho transcript dài
- ts-fsrs cho ôn tập ngắt quãng, Zod để kiểm tra dữ liệu
- Vercel AI SDK + Claude (tuỳ chọn, cho dịch máy và tra nghĩa; bản demo không bật)
- Vitest, ESLint; triển khai trên Vercel

## Chạy ở máy

Cần Node.js 20 trở lên.

```bash
npm install
npm run dev
```

Mở http://localhost:3000. Không cần biến môi trường nào để chạy. Muốn bật dịch máy và tra nghĩa bằng Claude, chép `.env.example` thành `.env.local` rồi điền `ANTHROPIC_API_KEY`.

Kiểm tra trước khi đẩy code:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

## Nguồn nội dung

Transcript và bản dịch thuộc cộng đồng TED, theo giấy phép [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/). Video phát trực tiếp từ máy chủ của TED, không tải về hay lưu lại. Dự án không liên kết với TED.
