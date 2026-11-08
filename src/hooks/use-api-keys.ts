"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import type { ApiKey } from "@/lib/dashboard/types";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";

function needsModelCheck(provider: string): boolean {
  return provider === "gemini" || provider === "groq";
}

export function useApiKeys() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newProvider, setNewProviderState] = useState("gemini");
  const [newApiKey, setNewApiKeyState] = useState("");
  const [newLabel, setNewLabelState] = useState("");
  const [addingKey, setAddingKey] = useState(false);
  const [reorderingKeys, setReorderingKeys] = useState(false);
  const [geminiModel, setGeminiModelState] = useState(DEFAULT_GEMINI_MODEL);
  const [groqModel, setGroqModelState] = useState(DEFAULT_GROQ_MODEL);
  const [checkingModel, setCheckingModel] = useState(false);
  const [checkMessage, setCheckMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [draftVerified, setDraftVerified] = useState(false);
  const dragKeyIndex = useRef<number | null>(null);
  const apiKeysOrderRef = useRef<ApiKey[]>([]);

  useEffect(() => {
    apiKeysOrderRef.current = apiKeys;
  }, [apiKeys]);

  const invalidateDraft = useCallback(() => {
    setDraftVerified(false);
    setCheckMessage(null);
  }, []);

  const setNewProvider = useCallback(
    (value: string) => {
      setNewProviderState(value);
      invalidateDraft();
    },
    [invalidateDraft],
  );

  const setNewApiKey = useCallback(
    (value: string) => {
      setNewApiKeyState(value);
      invalidateDraft();
    },
    [invalidateDraft],
  );

  const setNewLabel = useCallback((value: string) => {
    setNewLabelState(value);
  }, []);

  const setGeminiModel = useCallback(
    (value: string) => {
      setGeminiModelState(value);
      invalidateDraft();
    },
    [invalidateDraft],
  );

  const setGroqModel = useCallback(
    (value: string) => {
      setGroqModelState(value);
      invalidateDraft();
    },
    [invalidateDraft],
  );

  const fetchApiKeys = useCallback(async () => {
    const res = await fetch("/api/api-keys");
    const data = (await res.json()) as
      | { keys?: ApiKey[]; geminiModel?: string; groqModel?: string }
      | ApiKey[];
    if (Array.isArray(data)) {
      setApiKeys(data);
      return;
    }
    setApiKeys(Array.isArray(data.keys) ? data.keys : []);
    if (typeof data.geminiModel === "string" && data.geminiModel.trim()) {
      setGeminiModelState(data.geminiModel.trim());
    }
    if (typeof data.groqModel === "string" && data.groqModel.trim()) {
      setGroqModelState(data.groqModel.trim());
    }
  }, []);

  const currentModel = newProvider === "groq" ? groqModel.trim() : geminiModel.trim();

  const verifyAndSaveModel = useCallback(
    async (provider: string, apiKey: string, model: string): Promise<boolean> => {
      if (!apiKey) {
        setCheckMessage({
          ok: false,
          text: "Nhập API key rồi kiểm tra trước khi Thêm.",
        });
        return false;
      }
      if (!model) {
        setCheckMessage({ ok: false, text: "Nhập model rồi kiểm tra trước khi Thêm." });
        return false;
      }

      const checkAction = provider === "groq" ? "check-groq-model" : "check-gemini-model";
      const saveAction = provider === "groq" ? "save-groq-model" : "save-gemini-model";

      setCheckingModel(true);
      setCheckMessage(null);
      try {
        const res = await fetch("/api/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: checkAction, model, api_key: apiKey }),
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (!res.ok) {
          throw new Error(data?.error || "Không kiểm tra được model");
        }
        if (!data?.ok) {
          setDraftVerified(false);
          setCheckMessage({
            ok: false,
            text: data?.error || "Model không dùng được với key hiện tại.",
          });
          return false;
        }

        const saveRes = await fetch("/api/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: saveAction, model }),
        });
        const saveData = (await saveRes.json().catch(() => null)) as {
          geminiModel?: string;
          groqModel?: string;
        } | null;
        if (saveRes.ok) {
          if (provider === "groq" && saveData?.groqModel) {
            setGroqModelState(saveData.groqModel);
          } else if (saveData?.geminiModel) {
            setGeminiModelState(saveData.geminiModel);
          }
        }

        setDraftVerified(true);
        setCheckMessage({ ok: true, text: `Model "${model}" hoạt động. Có thể Thêm.` });
        return true;
      } catch (err) {
        console.error(err);
        setDraftVerified(false);
        setCheckMessage({
          ok: false,
          text: err instanceof Error ? err.message : "Kiểm tra model thất bại",
        });
        return false;
      } finally {
        setCheckingModel(false);
      }
    },
    [],
  );

  const addKey = useCallback(
    async (provider: string, apiKey: string, label: string, model: string) => {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          provider,
          api_key: apiKey,
          label: label || undefined,
          ...(provider === "gemini" && model ? { gemini_model: model } : {}),
          ...(provider === "groq" && model ? { groq_model: model } : {}),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Không thêm được API key");
      }
    },
    [],
  );

  const handlePrimaryAction = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const apiKey = newApiKey.trim();
      const label = newLabel.trim();
      const model = currentModel;

      if (!newProvider || !apiKey) return;

      if (needsModelCheck(newProvider) && !draftVerified) {
        await verifyAndSaveModel(newProvider, apiKey, model);
        return;
      }

      setAddingKey(true);
      try {
        await addKey(newProvider, apiKey, label, model);
        setNewApiKeyState("");
        setNewLabelState("");
        setDraftVerified(false);
        setCheckMessage(null);
        setNewProviderState("gemini");
        await fetchApiKeys();
      } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : "Thêm API key thất bại. Thử lại.";
        if (needsModelCheck(newProvider)) {
          setCheckMessage({ ok: false, text: message });
        } else {
          alert(message);
        }
      } finally {
        setAddingKey(false);
      }
    },
    [
      newProvider,
      newApiKey,
      newLabel,
      currentModel,
      draftVerified,
      verifyAndSaveModel,
      addKey,
      fetchApiKeys,
    ],
  );

  const handleDeleteKey = useCallback(
    async (id: number) => {
      await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      await fetchApiKeys();
    },
    [fetchApiKeys],
  );

  const handleResetKey = useCallback(
    async (id: number) => {
      await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", id }),
      });
      await fetchApiKeys();
    },
    [fetchApiKeys],
  );

  const persistApiKeyOrder = useCallback(
    async (ordered: ApiKey[]) => {
      setReorderingKeys(true);
      try {
        const res = await fetch("/api/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reorder",
            orderedIds: ordered.map((k) => k.id),
          }),
        });
        if (!res.ok) throw new Error("Không lưu được thứ tự");
        await fetchApiKeys();
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : "Lưu thứ tự thất bại");
        await fetchApiKeys();
      } finally {
        setReorderingKeys(false);
      }
    },
    [fetchApiKeys],
  );

  const handleKeyDragStart = useCallback((index: number) => {
    dragKeyIndex.current = index;
  }, []);

  const handleKeyDragOver = useCallback((e: DragEvent, index: number) => {
    e.preventDefault();
    const from = dragKeyIndex.current;
    if (from === null || from === index) return;
    setApiKeys((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      dragKeyIndex.current = index;
      apiKeysOrderRef.current = next;
      return next;
    });
  }, []);

  const handleKeyDrop = useCallback(async () => {
    dragKeyIndex.current = null;
    await persistApiKeyOrder(apiKeysOrderRef.current);
  }, [persistApiKeyOrder]);

  const handleKeyDragEnd = useCallback(() => {
    dragKeyIndex.current = null;
  }, []);

  const showModelField = needsModelCheck(newProvider);
  const canCheck = Boolean(newApiKey.trim() && (!showModelField || currentModel));
  const primaryIsAdd = !showModelField || draftVerified;
  const busy = checkingModel || addingKey;

  return {
    apiKeys,
    newProvider,
    setNewProvider,
    newApiKey,
    setNewApiKey,
    newLabel,
    setNewLabel,
    addingKey,
    reorderingKeys,
    geminiModel,
    setGeminiModel,
    groqModel,
    setGroqModel,
    checkingModel,
    checkMessage,
    draftVerified,
    showModelField,
    canCheck,
    primaryIsAdd,
    busy,
    fetchApiKeys,
    handlePrimaryAction,
    handleDeleteKey,
    handleResetKey,
    handleKeyDragStart,
    handleKeyDragOver,
    handleKeyDrop,
    handleKeyDragEnd,
  };
}
