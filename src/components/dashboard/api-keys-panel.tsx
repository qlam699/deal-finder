"use client";

import { memo, type DragEvent, type FormEvent } from "react";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApiKey } from "@/lib/dashboard/types";

type ApiKeysPanelProps = {
  apiKeys: ApiKey[];
  newProvider: string;
  onNewProviderChange: (value: string) => void;
  newApiKey: string;
  onNewApiKeyChange: (value: string) => void;
  newLabel: string;
  onNewLabelChange: (value: string) => void;
  reorderingKeys: boolean;
  geminiModel: string;
  groqModel: string;
  draftGeminiModel: string;
  onDraftGeminiModelChange: (value: string) => void;
  draftGroqModel: string;
  onDraftGroqModelChange: (value: string) => void;
  showModelField: boolean;
  canCheck: boolean;
  primaryIsAdd: boolean;
  busy: boolean;
  checkingModel: boolean;
  addingKey: boolean;
  checkMessage: { ok: boolean; text: string } | null;
  onPrimaryAction: (e: FormEvent<HTMLFormElement>) => void;
  onDeleteKey: (id: number) => void;
  onResetKey: (id: number) => void;
  onKeyDragStart: (index: number) => void;
  onKeyDragOver: (e: DragEvent, index: number) => void;
  onKeyDrop: () => void;
  onKeyDragEnd: () => void;
};

function providerLabel(provider: string): string {
  if (provider === "groq") return "Groq";
  if (provider === "cloudflare") return "Cloudflare";
  if (provider === "qwen") return "Qwen";
  if (provider === "openrouter") return "OpenRouter";
  return "Gemini";
}

function modelForProvider(
  provider: string,
  geminiModel: string,
  groqModel: string,
): string {
  if (provider === "gemini") return geminiModel || "gemini-3.5-flash-lite";
  if (provider === "groq") return groqModel || "qwen/qwen3.8-27b";
  if (provider === "qwen") return "qwen-turbo";
  if (provider === "openrouter") return "openrouter/free";
  if (provider === "cloudflare") return "@cf/meta/llama-3.1-8b-instruct-fast";
  return "—";
}

function ApiKeysPanelInner({
  apiKeys,
  newProvider,
  onNewProviderChange,
  newApiKey,
  onNewApiKeyChange,
  newLabel,
  onNewLabelChange,
  reorderingKeys,
  geminiModel,
  groqModel,
  draftGeminiModel,
  onDraftGeminiModelChange,
  draftGroqModel,
  onDraftGroqModelChange,
  showModelField,
  canCheck,
  primaryIsAdd,
  busy,
  checkingModel,
  addingKey,
  checkMessage,
  onPrimaryAction,
  onDeleteKey,
  onResetKey,
  onKeyDragStart,
  onKeyDragOver,
  onKeyDrop,
  onKeyDragEnd,
}: ApiKeysPanelProps) {
  const modelValue = newProvider === "groq" ? draftGroqModel : draftGeminiModel;
  const onModelChange =
    newProvider === "groq" ? onDraftGroqModelChange : onDraftGeminiModelChange;
  const modelPlaceholder =
    newProvider === "groq" ? "qwen/qwen3.8-27b" : "gemini-3.5-flash-lite";

  const primaryDisabled = busy || !canCheck;
  const primaryLabel = (() => {
    if (checkingModel) return "Đang kiểm tra...";
    if (addingKey) return "Đang thêm...";
    if (primaryIsAdd) return "Thêm";
    return "Kiểm tra";
  })();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Quản lý API Keys</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Kéo thả để xếp thứ tự ưu tiên (trên → dưới = chạy trước → sau). Key
          inactive/hết quota bị bỏ qua. Cuối cùng vẫn fallback scrape thuần nếu
          mọi AI thất bại.
          {reorderingKeys ? " Đang lưu thứ tự…" : ""}
        </p>

        <form onSubmit={onPrimaryAction} className="mb-2 flex flex-wrap items-center gap-2">
          <Select
            value={newProvider}
            onValueChange={(v) => onNewProviderChange(v || "gemini")}
          >
            <SelectTrigger className="w-36 shrink-0">
              <SelectValue placeholder="Provider">{providerLabel(newProvider)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini">Gemini</SelectItem>
              <SelectItem value="groq">Groq</SelectItem>
              <SelectItem value="cloudflare">Cloudflare Workers AI</SelectItem>
              <SelectItem value="qwen">Qwen</SelectItem>
              <SelectItem value="openrouter">OpenRouter</SelectItem>
            </SelectContent>
          </Select>
          <Input
            name="api_key"
            value={newApiKey}
            onChange={(e) => onNewApiKeyChange(e.target.value)}
            placeholder={
              newProvider === "cloudflare" ? "ACCOUNT_ID|API_TOKEN" : "API Key"
            }
            required
            className="min-w-[10rem] flex-1"
            disabled={busy}
          />
          {showModelField && (
            <Input
              name="model"
              value={modelValue}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder={modelPlaceholder}
              className="min-w-[12rem] flex-[1.2] font-mono text-sm"
              disabled={busy}
            />
          )}
          <Input
            name="label"
            value={newLabel}
            onChange={(e) => onNewLabelChange(e.target.value)}
            placeholder="Nhãn"
            className="w-28 shrink-0"
            disabled={busy}
          />
          <Button type="submit" className="shrink-0" disabled={primaryDisabled}>
            {primaryLabel}
          </Button>
        </form>

        {showModelField && checkMessage && (
          <p
            className={
              checkMessage.ok
                ? "mb-4 text-sm text-green-500"
                : "mb-4 text-sm text-destructive"
            }
          >
            {checkMessage.text}
          </p>
        )}
        {(!showModelField || !checkMessage) && <div className="mb-4" />}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Nhãn</TableHead>
              <TableHead>Hôm nay</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiKeys.map((k, index) => (
              <TableRow
                key={k.id}
                onDragOver={(e) => onKeyDragOver(e, index)}
                onDrop={() => void onKeyDrop()}
                className={reorderingKeys ? "opacity-70" : undefined}
              >
                <TableCell className="text-muted-foreground">
                  <button
                    type="button"
                    draggable={!reorderingKeys}
                    onDragStart={() => onKeyDragStart(index)}
                    onDragEnd={onKeyDragEnd}
                    className="-m-1 cursor-grab touch-none rounded p-1 hover:bg-muted active:cursor-grabbing"
                    aria-label="Kéo để đổi thứ tự"
                  >
                    <GripVertical className="size-4" aria-hidden />
                  </button>
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {index + 1}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{k.provider}</Badge>
                </TableCell>
                <TableCell
                  className="max-w-[14rem] truncate font-mono text-sm"
                  title={modelForProvider(k.provider, geminiModel, groqModel)}
                >
                  {modelForProvider(k.provider, geminiModel, groqModel)}
                </TableCell>
                <TableCell className="font-mono text-sm">{k.api_key}</TableCell>
                <TableCell>{k.label || "—"}</TableCell>
                <TableCell>{k.requests_today} req</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      k.status === "active"
                        ? "default"
                        : k.status === "exhausted_today"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {k.status === "exhausted_today" ? "hết quota hôm nay" : k.status}
                  </Badge>
                  {k.last_error && (
                    <p className="mt-1 max-w-xs truncate text-xs text-destructive">
                      {k.last_error}
                    </p>
                  )}
                </TableCell>
                <TableCell className="space-x-1">
                  {(k.status === "error" || k.status === "exhausted_today") && (
                    <Button variant="outline" size="sm" onClick={() => onResetKey(k.id)}>
                      Reset
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => onDeleteKey(k.id)}>
                    Xóa
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {apiKeys.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-4 text-center text-muted-foreground">
                  Chưa có API key nào. Thêm key để bắt đầu tra giá tự động.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export const ApiKeysPanel = memo(ApiKeysPanelInner);
