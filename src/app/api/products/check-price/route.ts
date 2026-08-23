import { NextRequest, NextResponse } from "next/server";
import { getProductById } from "@/lib/db";
import {
  clearPriceCheckError,
  getPriceCheckStatus,
  startPriceCheckBackground,
} from "@/lib/price-check-jobs";

function extractSellerDescription(product: {
  content?: string | null;
  raw_json?: string | null;
}): string {
  if (product.content?.trim()) return product.content;
  if (!product.raw_json) return "";
  try {
    const raw = JSON.parse(product.raw_json) as { body?: string };
    return raw.body || "";
  } catch {
    return "";
  }
}

export async function GET() {
  return NextResponse.json(getPriceCheckStatus());
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const product = getProductById(id) as
    | {
        id: number;
        title: string;
        price: number;
        content?: string | null;
        raw_json?: string | null;
      }
    | undefined;

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  clearPriceCheckError(id);
  const result = startPriceCheckBackground({
    id: product.id,
    title: product.title,
    price: product.price,
    sellerDescription: extractSellerDescription(product),
  });

  return NextResponse.json({
    success: true,
    ...result,
    ...getPriceCheckStatus(),
  });
}
