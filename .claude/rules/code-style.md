# Quy ước code

- Mặc định **Server Component**. Chỉ thêm `"use client"` khi cần state/effect/event handler thật sự — thường chỉ ở player, transcript pane, form.
- Data fetching trong RSC hoặc Server Action. **Không** gọi `fetch('/api/...')` từ client cho dữ liệu có thể lấy ở server.
- Mọi API route và Server Action: validate input bằng Zod ngay dòng đầu.
- Đặt tên: component `PascalCase.tsx`, hook `useThing.ts`, util `kebab-case.ts`.
- Thời gian: **luôn dùng milliseconds (`_ms`)** trong code và DB. Chỉ format sang `mm:ss` ở tầng hiển thị. Không trộn giây và mili — đây là nguồn bug số 1 của loại app này.
- Ngôn ngữ UI: i18n với `next-intl`, mặc định `vi`, có `en`. Không hardcode chuỗi tiếng Việt trong component.
- Error: throw `AppError` (có `code`) từ `lib/errors.ts`, không throw string.
