# Quy ước UI/UX — BẮT BUỘC

Hai quy tắc dưới đây không có ngoại lệ. Task nào vi phạm thì coi như chưa xong.

## 1. Mobile-friendly

- **Mobile-first**: viết style cho màn hình nhỏ trước, rồi mới thêm breakpoint `sm:` `md:` `lg:`. Không viết desktop rồi vá ngược.
- Ngưỡng test tối thiểu: **360×640** (Android phổ thông) và **390×844** (iPhone). Không được tràn ngang ở bất kỳ trang nào — `overflow-x` của `body` luôn phải sạch.
- Layout trang `/watch/ted/[slug]`:
  - Desktop: 2 cột — player bên trái, transcript pane bên phải, cuộn độc lập.
  - Mobile: player **sticky ở đầu màn hình** (thu nhỏ khi cuộn), transcript cuộn bên dưới full-width. Tuyệt đối không bê layout 2 cột xuống mobile.
- Touch target tối thiểu **44×44px**. Mỗi cue trong transcript phải đủ cao để bấm trúng bằng ngón tay.
- **Không có tương tác chỉ dùng hover.** Mọi thứ hover mở ra được thì tap cũng phải mở được. Tooltip-only = mất tính năng trên mobile.
- Dùng `100dvh`/`100svh`, không dùng `100vh` (thanh địa chỉ mobile làm sai chiều cao). Tôn trọng `env(safe-area-inset-*)` cho notch.
- Font tối thiểu 16px cho input — nhỏ hơn thì iOS Safari tự zoom khi focus.
- E2E: Playwright phải có ít nhất một project chạy viewport mobile, không chỉ desktop.

## Giao diện (2026-10-11, theo phong cách make10000hours)

- Nền trắng / gần đen, chữ xám đậm, font **Inter** (next/font, có subset `vietnamese`), accent **tím** (`accent`) cho dòng đang phát và focus. Gradient thương hiệu đỏ → cam → tím → hồng tím (`text-brand-gradient`, `bg-brand-gradient`) **chỉ cho tiêu đề và trang trí**, không cho chữ nhỏ cần đọc.
- **Sáng / tối:** mặc định theo máy; `ThemeToggle` ghi `<html data-theme>` + localStorage `abc:theme`, script trong `<head>` (`lib/theme.ts`) áp trước khi vẽ để không nháy. Màu tối khai báo trong `globals.css` dưới cả `:root[data-theme='dark']` lẫn `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])` — sửa màu thì sửa **cả hai** khối.
- Thumbnail bài mẫu dùng **ảnh 16:9 của chính TED** (`lib/featured-talks.ts`), qua `next/image`, có dòng ghi công CC BY-NC-ND. Không cắt ghép thành ảnh mới, không dùng ở chỗ có bán gì.

## 2. Animation khi scroll

- **Mỗi section trên trang marketing/landing phải có reveal animation khi lọt vào viewport.**
- Dùng **một component dùng chung** `components/ui/reveal.tsx` (IntersectionObserver + CSS transition). Không copy-paste logic observer ở từng chỗ, không cài animation library nếu CSS đủ dùng. Nếu cần orchestration phức tạp thì dùng `motion` — chỉ trong `(marketing)`, không kéo vào app shell.
- Chỉ animate **`transform` và `opacity`**. Không animate `height`, `top`, `margin`, `width` — reflow gây giật.
- Reveal chạy **một lần** (`once: true`). Không replay mỗi lần user cuộn qua cuộn lại — gây khó chịu.
- Thông số mặc định: `translateY(16px) → 0`, opacity `0 → 1`, `400ms`, `ease-out`, stagger `60ms` cho danh sách item.
- **Bắt buộc tôn trọng `prefers-reduced-motion: reduce`** → tắt hết animation, hiện nội dung ngay lập tức. Đây là accessibility, không phải tuỳ chọn.
- **Không animate trong khu vực làm việc**: transcript pane, cue list, player. Cue fade-in khi cuộn sẽ vừa khó đọc vừa xung đột với virtualization.
- **Nội dung không được phụ thuộc JS để hiển thị.** Trang transcript public cần SEO — không để `opacity: 0` trong HTML render từ server rồi chờ JS bật lên. Nếu JS hỏng/chậm, chữ vẫn phải đọc được và crawler vẫn phải thấy.
