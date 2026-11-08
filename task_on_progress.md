# Task on Progress

## 1. Task Summary

- Task: Fix model input auto-reset in Quản lý API Keys
- Objective: Allow typing a new Gemini/Groq model without the field snapping back to the saved default
- Started: 2026-11-08
- Status: Completed
- Priority: High

## 5. Implementation Progress

### Changes Completed

- [x] Split draft vs saved model state in `use-api-keys.ts`
- [x] Seed draft once on first successful fetch; polls only update saved models
- [x] Successful check/save updates both saved and draft
- [x] Wire `api-keys-panel.tsx` + `dashboard.tsx` draft props
- [x] Document in `architecture.md`
- [x] `npx tsc --noEmit` — pass

## 6. Modified Files

### `src/hooks/use-api-keys.ts`

- Change: `draftGeminiModel` / `draftGroqModel` for form; saved models for table/API sync
- Reason: Polling `fetchApiKeys` was overwriting the controlled input
- Impact: Typing no longer resets during scrape/price-check refresh
- Verification: tsc pass

### `src/components/dashboard/api-keys-panel.tsx`

- Change: Form uses draft props; table still uses saved `geminiModel`/`groqModel`
- Reason: Align UI with draft/saved split

### `src/components/dashboard.tsx`

- Change: Pass draft model props from hook

### `architecture.md`

- Change: Note client draft vs saved model behavior

## 9. Tests and Validation

### Completed

- [x] `npx tsc --noEmit` — pass

### Remaining

- [ ] Manual: API Keys tab → edit model while scrape/price-check running → value should stick

## 11. Next Steps

1. Manual verify in UI
2. Commit when user asks

## 12. Handoff Notes

- Root cause: scrape/price-check polling called `fetchApiKeys`, which wrote saved model into the form state
- Fix: hydrate drafts once; keep drafts independent of poll

## 13. Last Update

- Updated: 2026-11-08
- Updated by: Auto (Cursor agent)
- Current branch: main
- Git status summary: model draft/saved split implemented; uncommitted
