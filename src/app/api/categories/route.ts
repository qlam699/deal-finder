import { NextRequest, NextResponse } from "next/server";
import { getCategories, toggleCategory, addCategory } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getCategories());
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.action === "toggle") {
    toggleCategory(body.id, body.enabled);
    return NextResponse.json({ success: true });
  }

  if (body.action === "add") {
    addCategory(body.name, body.chotot_category_id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
