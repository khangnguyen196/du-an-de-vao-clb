# Lệnh & điều kiện hoàn thành

```bash
npm run dev          # dev server (turbopack)
npm run build        # production build — chạy trước khi báo "xong"
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run test         # vitest
npm run test:e2e     # playwright
npm run db:generate  # sinh migration từ schema Drizzle
npm run db:migrate   # apply migration
npm run db:studio    # drizzle studio
```

**Trước khi báo hoàn thành bất kỳ task code nào: chạy `npm run typecheck && npm run lint && npm run build`.** Nếu fail thì chưa xong.
