# Task on Progress

## 1. Task Summary

- Task: Configurable Gemini model with check
- Objective: Replace hardcoded Gemini model with persisted setting; UI to type/check/save
- Started: 2026-11-08
- Status: Completed
- Priority: Medium

## 5. Implementation Progress

### Changes Completed

- [x] `db.ts` — `DEFAULT_GEMINI_MODEL`, `getGeminiModel`, `saveGeminiModel`
- [x] `price-checker.ts` — uses `getGeminiModel()`; exported `pingGeminiModel`
- [x] `/api/api-keys` — GET `{ keys, geminiModel }`; actions `save-gemini-model`, `check-gemini-model`
- [x] `use-api-keys.ts` + `api-keys-panel.tsx` + `dashboard.tsx` — Model Gemini input + Kiểm tra (no Lưu)
- [x] Docs: `architecture.md`, `README.md`, `readme-vi.md`
- [x] Show Model Gemini only when provider select is `gemini` (hide for other providers)
- [x] Kiểm tra uses typed API key from the form (fallback to saved active Gemini key)
- [x] Removed Model Gemini Lưu button; model persists on successful Kiểm tra and on Thêm (Gemini)
- [x] Kiểm tra requires currently typed API key + model only (no saved-key fallback)
- [x] Groq model setting (default `qwen/qwen3.8-27b`) with type/check/add same as Gemini
- [x] Model column in API Keys list (Gemini/Groq from settings; others fixed)
- [x] Thêm for Gemini/Groq verifies key+model first; errors show inline like Kiểm tra
- [x] Compact one-row form; merged Kiểm tra→Thêm button (enable after key+model; Add after success)

## 6. Modified Files

- `src/lib/db.ts`
- `src/lib/price-checker.ts`
- `src/app/api/api-keys/route.ts`
- `src/hooks/use-api-keys.ts`
- `src/components/dashboard/api-keys-panel.tsx`
- `src/components/dashboard.tsx`
- `architecture.md`
- `README.md`
- `readme-vi.md`
- `task_on_progress.md`

## 9. Tests and Validation

### Completed

- [x] `npx tsc --noEmit` — pass

### Remaining

- [ ] Manual: API Keys tab → type key + model → Kiểm tra → Thêm → run price check

## 11. Next Steps

1. Manual verify in UI with a real Gemini key
2. Commit when user asks

## 12. Handoff Notes

- Default model id is `gemini-3.5-flash-lite` until saved otherwise
- Check uses current input (not only saved value) + first active Gemini key
- GET `/api/api-keys` shape changed from bare array to `{ keys, geminiModel }`

## 13. Last Update

- Updated: 2026-11-08
- Updated by: Auto (Cursor agent)
- Current branch: main
- Git status summary: gemini model setting implemented; uncommitted
