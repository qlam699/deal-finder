import { checkPrice } from "@/lib/price-checker";

const pending = new Set<number>();
const lastError = new Map<number, string>();

export function isPriceCheckPending(id: number): boolean {
  return pending.has(id);
}

export function getPriceCheckStatus() {
  return {
    pendingIds: [...pending],
    errors: Object.fromEntries(lastError),
  };
}

export function startPriceCheckBackground(product: {
  id: number;
  title: string;
  price: number;
  sellerDescription: string;
}): { started: boolean; message: string } {
  if (pending.has(product.id)) {
    return { started: false, message: "Đang tìm hiểu sản phẩm này rồi" };
  }

  pending.add(product.id);
  lastError.delete(product.id);

  void (async () => {
    console.log(`[PRICE-JOB] Start background product_id=${product.id}`);
    try {
      const ok = await checkPrice(
        product.id,
        product.title,
        product.price,
        product.sellerDescription,
      );
      if (!ok) {
        lastError.set(product.id, "Không lấy được giá AI. Kiểm tra API keys rồi thử lại.");
        console.warn(`[PRICE-JOB] Failed product_id=${product.id}`);
      } else {
        console.log(`[PRICE-JOB] Done product_id=${product.id}`);
      }
    } catch (err) {
      lastError.set(product.id, String(err));
      console.error(`[PRICE-JOB] Error product_id=${product.id}`, err);
    } finally {
      pending.delete(product.id);
    }
  })();

  return { started: true, message: "Đã bắt đầu tìm hiểu ngầm" };
}

export function clearPriceCheckError(id: number) {
  lastError.delete(id);
}
