export function formatPrice(price: number): string {
  return new Intl.NumberFormat("vi-VN").format(price) + "đ";
}

export function parseDbDate(value: string | number): Date {
  if (typeof value === "number") return new Date(value);
  // SQLite localtime: "YYYY-MM-DD HH:MM:SS" (giờ VN, không có timezone suffix)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return new Date(value.replace(" ", "T") + "+07:00");
  }
  return new Date(value);
}

export function formatDateTime(value: string | number): string {
  const date = parseDbDate(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (Number.isNaN(date.getTime())) return "—";
  if (diffMs < 0) return "vừa xong";

  const sec = Math.floor(diffMs / 1000);
  if (sec < 10) return "vừa xong";
  if (sec < 60) return `${sec} giây trước`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;

  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} giờ trước`;

  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} ngày trước`;

  const month = Math.floor(day / 30);
  if (month < 12) return `${month} tháng trước`;

  const year = Math.floor(month / 12);
  return `${year} năm trước`;
}

export function normalizeImageUrl(url?: string): string {
  if (!url) return "";
  // Backward-compat for old malformed records in local DB.
  return url.replace("https://cdn.chotot.com/unsafe/585x440/https://", "https://");
}

export function formatIntegerWithCommas(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("vi-VN").format(value);
}

export function parseIntegerInput(value: string): number {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? Math.max(0, Number(digits)) : 0;
}
