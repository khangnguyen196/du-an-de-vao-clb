# Làm việc với Claude

- Đọc file liên quan trước khi sửa; theo style sẵn có của file đó.
- Task chạm nhiều file (>3) hoặc đổi schema: mô tả kế hoạch ngắn trước, rồi mới code.
- Đổi DB schema = sửa `lib/db/schema.ts` + sinh migration + viết RLS policy. Không sửa DB thủ công trên Supabase dashboard.
- Không commit/push nếu tôi không yêu cầu. Không tạo file docs/README mới trừ khi được hỏi.
- Không viết mock/fake data để test "cho qua" — nếu chưa chạy được thì nói thẳng.
- Secrets chỉ đọc từ env (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, ...). Service role key **chỉ** dùng ở server, không bao giờ lọt vào bundle client.
- Trả lời tôi bằng tiếng Việt; code, tên biến và comment trong code bằng tiếng Anh.
