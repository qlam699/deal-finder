import { NextResponse } from "next/server";
import { scrapeAllCategories } from "@/lib/scraper";
import { getUncheckedProducts } from "@/lib/db";
import { checkPrice } from "@/lib/price-checker";

let cronInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function runJob() {
  if (isRunning) return;
  isRunning = true;
  console.log("[CRON] Job started");
  try {
    await scrapeAllCategories();
    const unchecked = getUncheckedProducts(3) as {
      id: number;
      title: string;
      price: number;
      raw_json?: string;
    }[];
    for (const p of unchecked) {
      console.log(`[CRON] price-check product_id=${p.id} title="${p.title}"`);
      let sellerDescription = "";
      if (p.raw_json) {
        try {
          const raw = JSON.parse(p.raw_json) as { body?: string };
          sellerDescription = raw.body || "";
        } catch {
          sellerDescription = "";
        }
      }
      await checkPrice(p.id, p.title, p.price, sellerDescription);
    }
  } catch (err) {
    console.error("Cron job error:", err);
  } finally {
    console.log("[CRON] Job finished");
    isRunning = false;
  }
}

export async function POST(request: Request) {
  const body = await request.json();

  if (body.action === "start") {
    const intervalMs = (body.intervalMinutes || 10) * 60 * 1000;
    if (cronInterval) clearInterval(cronInterval);
    cronInterval = setInterval(runJob, intervalMs);
    runJob(); // Run immediately
    console.log(`[CRON] Started intervalMinutes=${body.intervalMinutes || 10}`);
    return NextResponse.json({ status: "started", intervalMinutes: body.intervalMinutes || 10 });
  }

  if (body.action === "stop") {
    if (cronInterval) {
      clearInterval(cronInterval);
      cronInterval = null;
    }
    console.log("[CRON] Stopped");
    return NextResponse.json({ status: "stopped" });
  }

  if (body.action === "status") {
    return NextResponse.json({ running: !!cronInterval, jobActive: isRunning });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
