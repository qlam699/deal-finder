"use client";

import {
  memo,
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatIntegerWithCommas, parseIntegerInput } from "@/lib/dashboard/format";
import { skipKeywordsToText, normalizeSkipKeywords } from "@/lib/dashboard/scrape-settings";
import type { Category, ScrapeSettingsState } from "@/lib/dashboard/types";

type ScrapeHeaderProps = {
  jobMessage: string;
  categories: Category[];
  scrapeSettingsOpen: boolean;
  onScrapeSettingsOpenChange: (open: boolean) => void;
  scrapeSettings: ScrapeSettingsState;
  setScrapeSettings: Dispatch<SetStateAction<ScrapeSettingsState>>;
  scrapeLimit: number;
  setScrapeLimit: (value: number) => void;
  scraping: boolean;
  savingScrapeSettings: boolean;
  cronRunning: boolean;
  canScrape: boolean;
  onToggleCategory: (id: number, enabled: boolean) => void;
  onSaveScrapeSettings: (override?: Partial<ScrapeSettingsState>) => void;
  onToggleCron: (override?: Partial<ScrapeSettingsState>) => void;
  onScrape: (override?: Partial<ScrapeSettingsState>) => void;
};

function ScrapeHeaderInner({
  jobMessage,
  categories,
  scrapeSettingsOpen,
  onScrapeSettingsOpenChange,
  scrapeSettings,
  setScrapeSettings,
  scrapeLimit,
  setScrapeLimit,
  scraping,
  savingScrapeSettings,
  cronRunning,
  canScrape,
  onToggleCategory,
  onSaveScrapeSettings,
  onToggleCron,
  onScrape,
}: ScrapeHeaderProps) {
  // Draft text so typing newlines/spaces is not wiped by normalize-on-every-keystroke.
  const [skipKeywordsDraft, setSkipKeywordsDraft] = useState(() =>
    skipKeywordsToText(scrapeSettings.skipKeywords),
  );

  useEffect(() => {
    if (!scrapeSettingsOpen) return;
    setSkipKeywordsDraft(skipKeywordsToText(scrapeSettings.skipKeywords));
    // Only rehydrate draft when opening the dialog — not on every settings poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open transition only
  }, [scrapeSettingsOpen]);

  const keywordsOverrideFromDraft = useCallback(
    (): Partial<ScrapeSettingsState> => ({
      skipKeywords: normalizeSkipKeywords(skipKeywordsDraft),
    }),
    [skipKeywordsDraft],
  );

  const commitSkipKeywordsDraft = useCallback(() => {
    const skipKeywords = normalizeSkipKeywords(skipKeywordsDraft);
    setScrapeSettings((prev) => ({ ...prev, skipKeywords }));
    setSkipKeywordsDraft(skipKeywordsToText(skipKeywords));
    return skipKeywords;
  }, [skipKeywordsDraft, setScrapeSettings]);

  const draftKeywordCount = normalizeSkipKeywords(skipKeywordsDraft).length;

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold">Chotot Deal Finder</h1>
        {jobMessage && (
          <p className="mt-1 text-sm text-muted-foreground">{jobMessage}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Dialog open={scrapeSettingsOpen} onOpenChange={onScrapeSettingsOpenChange}>
          <DialogTrigger render={<Button variant="outline" type="button" />}>
            Cài đặt quét
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Cài đặt quét</DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-1">
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Danh mục</h3>
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
                  {categories.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Chưa có danh mục nào.</p>
                  ) : (
                    categories.map((category) => (
                      <label
                        key={category.id}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                      >
                        <span className="text-sm font-medium">{category.name}</span>
                        <input
                          type="checkbox"
                          checked={category.enabled === 1}
                          onChange={() => {
                            void onToggleCategory(category.id, category.enabled === 0);
                          }}
                        />
                      </label>
                    ))
                  )}
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Cá nhân</h3>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={scrapeSettings.personalOnly}
                    onChange={(e) =>
                      setScrapeSettings((prev) => ({
                        ...prev,
                        personalOnly: e.target.checked,
                      }))
                    }
                  />
                  Chỉ quét tin người đăng là cá nhân
                </label>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Giá</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="scrape-min-price">Giá tối thiểu</Label>
                    <Input
                      id="scrape-min-price"
                      type="text"
                      inputMode="numeric"
                      value={formatIntegerWithCommas(scrapeSettings.minPrice)}
                      onChange={(e) =>
                        setScrapeSettings((prev) => ({
                          ...prev,
                          minPrice: parseIntegerInput(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="scrape-max-price">Giá tối đa</Label>
                    <Input
                      id="scrape-max-price"
                      type="text"
                      inputMode="numeric"
                      value={formatIntegerWithCommas(scrapeSettings.maxPrice)}
                      onChange={(e) =>
                        setScrapeSettings((prev) => ({
                          ...prev,
                          maxPrice: parseIntegerInput(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Chênh lệch</h3>
                <div className="space-y-1.5">
                  <Label htmlFor="scrape-min-margin">Mức chênh lệch tối thiểu (%)</Label>
                  <Input
                    id="scrape-min-margin"
                    type="number"
                    min={1}
                    max={100}
                    value={scrapeSettings.minMarginPercent}
                    onChange={(e) =>
                      setScrapeSettings((prev) => ({
                        ...prev,
                        minMarginPercent: Number(e.target.value),
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Chỉ lưu và hiện tin khi cột chênh lệch ≥ mức này (vd. 30 = cần ≥30%).
                  </p>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Từ khóa bỏ qua</h3>
                <div className="space-y-1.5">
                  <Label htmlFor="scrape-skip-keywords">
                    Bỏ qua tin nếu tiêu đề hoặc mô tả chứa từ khóa
                  </Label>
                  <textarea
                    id="scrape-skip-keywords"
                    rows={5}
                    value={skipKeywordsDraft}
                    onChange={(e) => setSkipKeywordsDraft(e.target.value)}
                    onBlur={() => {
                      commitSkipKeywordsDraft();
                    }}
                    placeholder={"bể\như\nno faceid\nmất Face ID"}
                    className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[100px] w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  />
                  <p className="text-xs text-muted-foreground">
                    Mỗi dòng một từ khóa (hoặc cách bằng dấu phẩy). Không phân biệt hoa/thường.
                    Ví dụ: bể, hư, no faceid.
                    {draftKeywordCount > 0 ? ` Đang có ${draftKeywordCount} từ khóa.` : ""}
                  </p>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Số tin sẽ quét</h3>
                <div className="space-y-1.5">
                  <Label htmlFor="scrape-limit">Mỗi lần quét / danh mục</Label>
                  <Input
                    id="scrape-limit"
                    type="number"
                    min={1}
                    max={50}
                    value={scrapeLimit}
                    onChange={(e) => setScrapeLimit(Number(e.target.value))}
                    disabled={scraping}
                    className="w-24"
                  />
                </div>
              </section>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onScrapeSettingsOpenChange(false)}
                disabled={savingScrapeSettings}
              >
                Hủy
              </Button>
              <Button
                type="button"
                onClick={() => void onSaveScrapeSettings(keywordsOverrideFromDraft())}
                disabled={savingScrapeSettings}
              >
                {savingScrapeSettings ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Button
          variant="outline"
          onClick={() => void onToggleCron(keywordsOverrideFromDraft())}
          disabled={!cronRunning && !canScrape}
          title={
            !cronRunning && !canScrape
              ? "Thêm ít nhất 1 API key trước khi bật quét định kỳ"
              : undefined
          }
        >
          {cronRunning ? "Tắt quét định kỳ" : "Bật quét định kỳ (10p)"}
        </Button>
        <Button
          onClick={() => void onScrape(keywordsOverrideFromDraft())}
          disabled={scraping || !canScrape}
          title={!canScrape ? "Thêm ít nhất 1 API key trước khi quét" : undefined}
        >
          {scraping ? "Đang quét ngầm..." : "Quét sản phẩm mới"}
        </Button>
      </div>
    </div>
  );
}

export const ScrapeHeader = memo(ScrapeHeaderInner);
