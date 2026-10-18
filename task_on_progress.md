# Task on Progress

## 1. Task Summary

- Task: Fix scrape limit save in Cài đặt quét
- Objective: Số tin sẽ quét persists when user clicks Lưu
- Started: 2026-10-18
- Status: Completed (build TS fix applied)
- Priority: High

## 5. Implementation Progress

### Changes Completed

- [x] Add `limitPerCategory` to DB + frontend scrape settings
- [x] API `action: "save-settings"` — persist without starting scrape
- [x] Bind UI input to `scrapeSettings.limitPerCategory`; remove separate `scrapeLimit` state
- [x] Scrape/cron use saved limit; job falls back to settings
- [x] Docs + `tsc --noEmit` pass
- [x] Fix TS2783 duplicate `scrapeSettings` in save-settings response (spread order)

## 6. Modified Files

- `src/lib/db.ts`
- `src/lib/dashboard/types.ts`
- `src/lib/dashboard/scrape-settings.ts`
- `src/lib/background-job.ts`
- `src/app/api/scrape/route.ts`
- `src/app/api/cron/route.ts`
- `src/hooks/use-scrape-job.ts`
- `src/components/dashboard/scrape-header.tsx`
- `src/components/dashboard.tsx`
- `architecture.md`
- `task_on_progress.md`

## 9. Tests and Validation

### Completed

- [x] `node node_modules/typescript/bin/tsc --noEmit` — pass

### Remaining

- [ ] Manual: Cài đặt quét → đổi Số tin → Lưu → mở lại dialog → giá trị còn; Quét dùng đúng limit

## 11. Next Steps

1. Manual smoke as above
2. Commit when user asks

## 12. Handoff Notes

- Root cause: limit was ephemeral React state; Save POSTed only `settings` and accidentally started a scrape with default limit 5
- Fix: `limitPerCategory` in `scrape_settings`; Save uses `{ action: "save-settings", settings }`

## 13. Last Update

- Updated: 2026-10-18
- Updated by: Auto (Cursor agent)
- Current branch: main
