import { NextResponse } from "next/server";
import { getJobStatus, startCron, stopCron } from "@/lib/background-job";

export async function POST(request: Request) {
  const body = await request.json();

  if (body.action === "start") {
    const status = startCron(
      body.intervalMinutes || 10,
      body.limitPerCategory ?? body.scrapeLimit,
    );
    return NextResponse.json({ status: "started", ...status });
  }

  if (body.action === "stop") {
    const status = stopCron();
    return NextResponse.json({ status: "stopped", ...status });
  }

  if (body.action === "status") {
    return NextResponse.json(getJobStatus());
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json(getJobStatus());
}
