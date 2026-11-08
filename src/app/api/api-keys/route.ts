import { NextRequest, NextResponse } from "next/server";
import {
  getApiKeys,
  addApiKey,
  deleteApiKey,
  resetKeyStatus,
  reorderApiKeys,
  getGeminiModel,
  saveGeminiModel,
  getGroqModel,
  saveGroqModel,
} from "@/lib/db";
import { pingGeminiModel, pingGroqModel } from "@/lib/price-checker";

export async function GET() {
  const keys = getApiKeys() as {
    id: number;
    provider: string;
    api_key: string;
    label: string;
    priority: number;
    requests_today: number;
    last_error: string;
    status: string;
    created_at: string;
  }[];
  // Mask API keys for security
  const masked = keys.map((k) => ({
    ...k,
    api_key: k.api_key.slice(0, 8) + "..." + k.api_key.slice(-4),
  }));
  return NextResponse.json({
    keys: masked,
    geminiModel: getGeminiModel(),
    groqModel: getGroqModel(),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.action === "add") {
    if (!body.provider || !body.api_key) {
      return NextResponse.json({ error: "provider and api_key are required" }, { status: 400 });
    }
    if (body.provider === "cloudflare") {
      const raw = String(body.api_key);
      const sep = raw.indexOf("|");
      const accountId = sep > 0 ? raw.slice(0, sep).trim() : "";
      const token = sep > 0 ? raw.slice(sep + 1).trim() : "";
      if (!/^[a-f0-9]{32}$/i.test(accountId) || !token) {
        return NextResponse.json(
          { error: "Cloudflare key must be ACCOUNT_ID|API_TOKEN (32-char hex Account ID)" },
          { status: 400 },
        );
      }
    }
    addApiKey(body.provider, body.api_key, body.label);
    const extra: { geminiModel?: string; groqModel?: string } = {};
    if (body.provider === "gemini") {
      const model = String(body.gemini_model || "").trim();
      if (model) {
        extra.geminiModel = saveGeminiModel(model);
      }
    }
    if (body.provider === "groq") {
      const model = String(body.groq_model || "").trim();
      if (model) {
        extra.groqModel = saveGroqModel(model);
      }
    }
    return NextResponse.json({ success: true, ...extra });
  }

  if (body.action === "delete") {
    deleteApiKey(body.id);
    return NextResponse.json({ success: true });
  }

  if (body.action === "reset") {
    resetKeyStatus(body.id);
    return NextResponse.json({ success: true });
  }

  if (body.action === "reorder") {
    const orderedIds = body.orderedIds as unknown;
    if (
      !Array.isArray(orderedIds) ||
      orderedIds.length === 0 ||
      !orderedIds.every((id) => Number.isInteger(id))
    ) {
      return NextResponse.json(
        { error: "orderedIds must be a non-empty array of integers" },
        { status: 400 },
      );
    }
    reorderApiKeys(orderedIds as number[]);
    return NextResponse.json({ success: true });
  }

  if (body.action === "save-gemini-model") {
    const model = String(body.model || "").trim();
    if (!model) {
      return NextResponse.json({ error: "model is required" }, { status: 400 });
    }
    try {
      const geminiModel = saveGeminiModel(model);
      return NextResponse.json({ success: true, geminiModel });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save Gemini model";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (body.action === "check-gemini-model") {
    const model = String(body.model || "").trim();
    const apiKey = String(body.api_key || "").trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "api_key is required (typed key only; no saved-key fallback)" },
        { status: 400 },
      );
    }
    if (!model) {
      return NextResponse.json({ error: "model is required" }, { status: 400 });
    }
    const result = await pingGeminiModel(apiKey, model);
    if (result.ok) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: result.error });
  }

  if (body.action === "save-groq-model") {
    const model = String(body.model || "").trim();
    if (!model) {
      return NextResponse.json({ error: "model is required" }, { status: 400 });
    }
    try {
      const groqModel = saveGroqModel(model);
      return NextResponse.json({ success: true, groqModel });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save Groq model";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (body.action === "check-groq-model") {
    const model = String(body.model || "").trim();
    const apiKey = String(body.api_key || "").trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "api_key is required (typed key only; no saved-key fallback)" },
        { status: 400 },
      );
    }
    if (!model) {
      return NextResponse.json({ error: "model is required" }, { status: 400 });
    }
    const result = await pingGroqModel(apiKey, model);
    if (result.ok) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: result.error });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
