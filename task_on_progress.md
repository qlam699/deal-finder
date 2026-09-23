# Task on Progress

## 1. Task Summary

- Task: Skip listings by configurable keywords
- Objective: Ignore ads whose title/body contain skip keywords during scrape
- Requested behavior: Settings field for keywords (e.g. bể, hư, no faceid)
- Expected result: Keywords in scrape_settings; scraper skips matches; UI in Cài đặt quét
- Started: 2026-09-23
- Status: Completed
- Priority: Medium

## 2. Scope

### In Scope

- `skipKeywords: string[]` on scrape settings (DB + frontend)
- Scraper filter before insert
- Textarea in scrape settings dialog

### Out of Scope

- Retroactive purge of existing products
- Regex / word-boundary matching (substring, case-insensitive)

## 5. Implementation Progress

### Changes Completed

- [x] `src/lib/db.ts` — `skipKeywords` + `normalizeSkipKeywords`
- [x] `src/lib/dashboard/{types,scrape-settings}.ts` — frontend parity + textarea helpers
- [x] `src/lib/scraper.ts` — skip before `ingestAd` (same pattern as price filter)
- [x] `src/components/dashboard/scrape-header.tsx` — textarea UI
- [x] Docs + `tsc` pass

## 6. Modified Files

- `src/lib/db.ts`
- `src/lib/dashboard/types.ts`
- `src/lib/dashboard/scrape-settings.ts`
- `src/lib/scraper.ts`
- `src/components/dashboard/scrape-header.tsx`
- `architecture.md`
- `task_on_progress.md`

## 9. Tests and Validation

### Completed

- [x] `npx tsc --noEmit` — pass

### Remaining

- [ ] Manual: set keywords → scrape → confirm `[SCRAPER] SKIP keyword=...` in logs

## 11. Next Steps

1. Manual smoke on Cài đặt quét → Lưu → Quét
2. Commit when user asks

## 12. Handoff Notes

- Keyword match: case-insensitive substring on `subject` + `body`
- Skipped ads are not inserted and not written to `seen_products` (same as out-of-price-range)
- Max 100 keywords, 80 chars each

## 13. Last Update

- Updated: 2026-09-23
- Updated by: Auto (Cursor agent)
- Current branch: main
