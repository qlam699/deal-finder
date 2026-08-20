import { NextRequest, NextResponse } from "next/server";
import { getApiKeys, addApiKey, deleteApiKey, resetKeyStatus } from "@/lib/db";

export async function GET() {
  const keys = getApiKeys() as { id: number; provider: string; api_key: string; label: string; priority: number; requests_today: number; last_error: string; status: string; created_at: string }[];
  // Mask API keys for security
  const masked = keys.map((k) => ({
    ...k,
    api_key: k.api_key.slice(0, 8) + "..." + k.api_key.slice(-4),
  }));
  return NextResponse.json(masked);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.action === "add") {
    if (!body.provider || !body.api_key) {
      return NextResponse.json({ error: "provider and api_key are required" }, { status: 400 });
    }
    addApiKey(body.provider, body.api_key, body.label);
    return NextResponse.json({ success: true });
  }

  if (body.action === "delete") {
    deleteApiKey(body.id);
    return NextResponse.json({ success: true });
  }

  if (body.action === "reset") {
    resetKeyStatus(body.id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
