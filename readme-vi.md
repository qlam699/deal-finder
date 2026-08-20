# Chotot Deal Finder (README tiếng Việt)

Tài liệu này giải thích nhanh source code hiện tại của dự án `olddevice-chotot`.

## 1) Mục tiêu dự án

Web app giúp bạn:
- Quét tin mới từ Chợ Tốt theo danh mục đã bật.
- Ước lượng giá thị trường bằng chuỗi fallback nhiều provider AI.
- Tính `% chênh lệch` để hỗ trợ quyết định mua đi bán lại.
- Quản lý API key ngay trên UI.

## 2) Công nghệ chính

- `Next.js 16` + App Router
- `React 19` + `TypeScript`
- `SQLite` qua `better-sqlite3`
- `shadcn/ui` cho giao diện
- `@google/generative-ai`, `openai` SDK (dùng cho DeepSeek/Qwen/OpenRouter qua baseURL)
- `cheerio` để parse HTML khi scrape fallback

## 3) Cấu trúc source quan trọng

- `src/app/page.tsx`  
  Entry page, render `ClientPage`.

- `src/app/client-page.tsx`  
  Load dashboard bằng `dynamic(..., { ssr: false })` để tránh hydration mismatch khi extension trình duyệt inject HTML attributes.

- `src/components/dashboard.tsx`  
  UI chính gồm 3 tab:
  - Sản phẩm
  - Danh mục
  - API Keys

- `src/lib/db.ts`  
  Kết nối SQLite, tạo schema và helper truy vấn.

- `src/lib/scraper.ts`  
  Quét dữ liệu từ Chợ Tốt public API và lưu vào DB.

- `src/lib/price-checker.ts`  
  Logic định giá + fallback chain nhiều provider.

- `src/app/api/*/route.ts`  
  Các API nội bộ cho frontend gọi.

## 4) Thiết kế database

File DB: `data.db` (tự tạo ở root project).

Các bảng:

- `categories`
  - Danh mục theo dõi (`name`, `chotot_category_id`, `enabled`)
  - Seed mặc định: Điện thoại, Laptop, Máy tính bảng.

- `products`
  - Tin scrape từ Chợ Tốt (`chotot_id`, `title`, `price`, `market_price`, `profit_margin`, ...)
  - `checked = 0/1` để biết đã định giá hay chưa.

- `api_keys`
  - Lưu nhiều key theo provider (`gemini`, `deepseek`, `qwen`, `openrouter`)
  - Có `priority`, `requests_today`, `status`, `last_error`.

- `settings`
  - Dự phòng cấu hình key-value.

## 5) Luồng xử lý chính

1. User bấm **Quét sản phẩm mới** trên UI.
2. `POST /api/scrape` chạy:
   - `scrapeAllCategories()` lấy tin mới từ Chợ Tốt.
   - Lấy danh sách sản phẩm chưa check giá (`getUncheckedProducts`).
   - Chạy `checkPrice(...)` cho từng sản phẩm.
3. `checkPrice` thử lần lượt theo provider:
   - `gemini` -> `deepseek` -> `qwen` -> `openrouter`
   - Nếu fail hết, fallback cuối: scrape giá trực tiếp từ web bán lẻ.
4. Khi có giá thị trường:
   - Tính `% chênh lệch` và cập nhật vào `products`.

## 6) Fallback chain định giá

Trong `src/lib/price-checker.ts`:

- **Gemini**
  - Dùng `gemini-2.5-flash` + `googleSearch` tool.
  - Prompt yêu cầu trả JSON `{min,max,average,sources}`.

- **DeepSeek / Qwen / OpenRouter**
  - Lấy dữ liệu scrape hỗ trợ (`scrapeDataForAI`) rồi gửi model phân tích.

- **Scrape thuần**
  - Parse giá bằng `cheerio` từ kết quả tìm kiếm, lấy trung bình.

## 7) API nội bộ

- `POST /api/scrape`
  - Quét dữ liệu + định giá một batch sản phẩm mới.

- `GET /api/products?category=&limit=&offset=&sortBy=`
  - Lấy danh sách sản phẩm để hiển thị bảng.

- `GET/POST /api/categories`
  - `GET`: lấy danh mục
  - `POST action=toggle|add`: bật/tắt hoặc thêm danh mục

- `GET/POST /api/api-keys`
  - `GET`: trả danh sách key đã mask (ẩn bớt ký tự)
  - `POST action=add|delete|reset`

- `POST /api/cron`
  - `action=start|stop|status`
  - Dùng `setInterval` trong runtime server để chạy lặp theo phút.

## 8) Chạy dự án local

```bash
npm install
npm run dev
```

Mở: `http://localhost:3000`

## 9) Cách sử dụng nhanh

1. Vào tab **API Keys** -> thêm key cho 1 hoặc nhiều provider.
2. Vào tab **Danh mục** -> bật/tắt hoặc thêm category id Chợ Tốt.
3. Vào tab **Sản phẩm** -> bấm **Quét sản phẩm mới**.
4. Theo dõi cột:
   - Giá Chợ Tốt
   - Giá thị trường
   - Chênh lệch %

## 10) Ghi chú hiện trạng

- Dự án đang ở mức MVP, phù hợp test nhanh luồng scrape + định giá.
- `cron` hiện chạy trong memory của process Next.js (`setInterval`), nếu restart server thì lịch chạy sẽ mất.
- Một số selector scrape fallback có thể cần chỉnh theo thay đổi giao diện website nguồn.
- Có thể nâng cấp tiếp:
  - mã hóa API key trước khi lưu DB
  - retry/backoff tinh vi hơn theo từng provider
  - bổ sung log/audit chi tiết cho từng lần check giá
  - thêm cảnh báo theo ngưỡng lợi nhuận (Telegram/Zalo/Email).
