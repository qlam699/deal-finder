"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import type { ApiKey } from "@/lib/dashboard/types";

export function useApiKeys() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newProvider, setNewProvider] = useState("gemini");
  const [addingKey, setAddingKey] = useState(false);
  const [reorderingKeys, setReorderingKeys] = useState(false);
  const dragKeyIndex = useRef<number | null>(null);
  const apiKeysOrderRef = useRef<ApiKey[]>([]);

  useEffect(() => {
    apiKeysOrderRef.current = apiKeys;
  }, [apiKeys]);

  const fetchApiKeys = useCallback(async () => {
    const res = await fetch("/api/api-keys");
    setApiKeys(await res.json());
  }, []);

  const handleAddApiKey = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formEl = e.currentTarget;
      const form = new FormData(formEl);
      const apiKey = String(form.get("api_key") || "").trim();
      const label = String(form.get("label") || "").trim();

      if (!newProvider || !apiKey) return;

      setAddingKey(true);
      try {
        const res = await fetch("/api/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add",
            provider: newProvider,
            api_key: apiKey,
            label: label || undefined,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error || "Không thêm được API key");
        }
        formEl.reset();
        setNewProvider("gemini");
        await fetchApiKeys();
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : "Thêm API key thất bại. Thử lại.");
      } finally {
        setAddingKey(false);
      }
    },
    [newProvider, fetchApiKeys],
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

  return {
    apiKeys,
    newProvider,
    setNewProvider,
    addingKey,
    reorderingKeys,
    fetchApiKeys,
    handleAddApiKey,
    handleDeleteKey,
    handleResetKey,
    handleKeyDragStart,
    handleKeyDragOver,
    handleKeyDrop,
    handleKeyDragEnd,
  };
}
