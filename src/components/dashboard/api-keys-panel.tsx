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
  addingKey: boolean;
  reorderingKeys: boolean;
  onAddApiKey: (e: FormEvent<HTMLFormElement>) => void;
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

function ApiKeysPanelInner({
  apiKeys,
  newProvider,
  onNewProviderChange,
  addingKey,
  reorderingKeys,
  onAddApiKey,
  onDeleteKey,
  onResetKey,
  onKeyDragStart,
  onKeyDragOver,
  onKeyDrop,
  onKeyDragEnd,
}: ApiKeysPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quản lý API Keys</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          Kéo thả để xếp thứ tự ưu tiên (trên → dưới = chạy trước → sau). Key
          inactive/hết quota bị bỏ qua. Cuối cùng vẫn fallback scrape thuần nếu
          mọi AI thất bại.
          {reorderingKeys ? " Đang lưu thứ tự…" : ""}
        </p>

        <form onSubmit={onAddApiKey} className="mb-6 flex gap-2">
          <Select
            value={newProvider}
            onValueChange={(v) => onNewProviderChange(v || "gemini")}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Provider">{providerLabel(newProvider)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini">Gemini</SelectItem>
              <SelectItem value="groq">Groq (Qwen3.6-27B)</SelectItem>
              <SelectItem value="cloudflare">Cloudflare Workers AI</SelectItem>
              <SelectItem value="qwen">Qwen</SelectItem>
              <SelectItem value="openrouter">OpenRouter</SelectItem>
            </SelectContent>
          </Select>
          <Input
            name="api_key"
            placeholder={
              newProvider === "cloudflare" ? "ACCOUNT_ID|API_TOKEN" : "API Key"
            }
            required
            className="flex-1"
          />
          <Input name="label" placeholder="Nhãn (tùy chọn)" className="w-40" />
          <Button type="submit" disabled={addingKey}>
            {addingKey ? "Đang thêm..." : "Thêm"}
          </Button>
        </form>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Provider</TableHead>
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
                <TableCell colSpan={8} className="py-4 text-center text-muted-foreground">
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
