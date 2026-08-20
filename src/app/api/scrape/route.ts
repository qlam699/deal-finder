import { NextResponse } from "next/server";
import { scrapeAllCategories } from "@/lib/scraper";
import { getUncheckedProducts } from "@/lib/db";
import { checkPrice } from "@/lib/price-checker";

export async function POST() {
  try {
    console.log("[API] /api/scrape start");
    const scrapeResult = await scrapeAllCategories();

    // Check prices for new products
    const unchecked = getUncheckedProducts(5) as {
      id: number;
      title: string;
      price: number;
      raw_json?: string;
    }[];

    let priceChecked = 0;
    for (const product of unchecked) {
      console.log(`[API] price-check product_id=${product.id} title="${product.title}"`);
      let sellerDescription = "";
      if (product.raw_json) {
        try {
          const raw = JSON.parse(product.raw_json) as { body?: string };
          sellerDescription = raw.body || "";
        } catch {
          sellerDescription = "";
        }
      }
      const success = await checkPrice(
        product.id,
        product.title,
        product.price,
        sellerDescription,
      );
      if (success) priceChecked++;
    }

    console.log(
      `[API] /api/scrape done newProducts=${scrapeResult.total} priceChecked=${priceChecked}`,
    );
    return NextResponse.json({
      success: true,
      newProducts: scrapeResult.total,
      byCategory: scrapeResult.byCategory,
      priceChecked,
    });
  } catch (err) {
    console.error("[API] /api/scrape error", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
