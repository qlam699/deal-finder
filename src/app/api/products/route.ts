import { NextRequest, NextResponse } from "next/server";
import {
  countDeletedProducts,
  countProducts,
  getDeletedProducts,
  getProducts,
  hardDeleteAllTrashedProducts,
  hardDeleteProduct,
  restoreProduct,
  softDeleteProduct,
} from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category") || undefined;
  const search = searchParams.get("q")?.trim() || undefined;
  const pageSize = parseInt(searchParams.get("pageSize") || "10");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const offset = (page - 1) * pageSize;
  const sortBy = searchParams.get("sortBy") || "created_at";
  const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
  const trash = searchParams.get("trash") === "1";

  const items = trash
    ? getDeletedProducts({ limit: pageSize, offset })
    : getProducts({ category, search, limit: pageSize, offset, sortBy, sortOrder });
  const total = trash ? countDeletedProducts() : countProducts(category, search);

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.action === "soft-delete") {
    softDeleteProduct(body.id);
    return NextResponse.json({ success: true });
  }

  if (body.action === "restore") {
    restoreProduct(body.id);
    return NextResponse.json({ success: true });
  }

  if (body.action === "hard-delete") {
    hardDeleteProduct(body.id);
    return NextResponse.json({ success: true });
  }

  if (body.action === "empty-trash") {
    const result = hardDeleteAllTrashedProducts();
    return NextResponse.json({ success: true, deleted: result.changes });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
