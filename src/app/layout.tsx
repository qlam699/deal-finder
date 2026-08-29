import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chotot Deal Finder",
  description: "Tìm sản phẩm mua đi bán lại từ Chợ Tốt",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
      <footer className="text-center text-sm text-muted-foreground py-4">Deal Finder by QLam &copy; {new Date().getFullYear()}</footer>
    </html>
  );
}
