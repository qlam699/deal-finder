import { NextResponse } from "next/server";
import {
  getJobStatus,
  isJobRunning,
  runScrapeJob,
  startCron,
  stopCron,
  clampScrapeLimit,
} from "@/lib/background-job";

// Start one-shot background scrape (keeps running after browser closes,
// as long as `npm run dev` / `npm start` process is still alive).
export async function POST(request: Request) {
  try {
    let body: {
      action?: string;
      intervalMinutes?: number;
      limitPerCategory?: number;
      scrapeLimit?: number;
    } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const limitPerCategory = clampScrapeLimit(
      body.limitPerCategory ?? body.scrapeLimit,
    );

    if (body.action === "start-cron") {
      const status = startCron(body.intervalMinutes || 10, limitPerCategory);
      return NextResponse.json({ success: true, ...status });
    }

    if (body.action === "stop-cron") {
      const status = stopCron();
      return NextResponse.json({ success: true, ...status });
    }

    if (isJobRunning()) {
      return NextResponse.json({
        success: true,
        started: false,
        message: "Job đang chạy ngầm rồi",
        ...getJobStatus(),
      });
    }

    // Fire-and-forget: response returns immediately, work continues on server.
    void runScrapeJob({ mode: "once", limitPerCategory });

    return NextResponse.json({
      success: true,
      started: true,
      message: `Đã bắt đầu quét ngầm (mục tiêu ${limitPerCategory} deal hợp lệ/danh mục). Có thể tắt trình duyệt, miễn là server vẫn chạy.`,
      ...getJobStatus(),
    });
  } catch (err) {
    console.error("[API] /api/scrape error", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(getJobStatus());
}
