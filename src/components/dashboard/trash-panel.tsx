"use client";

import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateTime, formatPrice } from "@/lib/dashboard/format";
import type { Product } from "@/lib/dashboard/types";

type TrashPanelProps = {
  deletedProducts: Product[];
  deletedTotal: number;
  deletedPage: number;
  deletedTotalPages: number;
  onEmptyTrash: () => void;
  onRestore: (id: number) => void;
  onHardDelete: (id: number) => void;
  onPageChange: (page: number) => void;
};

function TrashPanelInner({
  deletedProducts,
  deletedTotal,
  deletedPage,
  deletedTotalPages,
  onEmptyTrash,
  onRestore,
  onHardDelete,
  onPageChange,
}: TrashPanelProps) {
  return (
    <>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
        <CardTitle>Thùng rác</CardTitle>
        <Button
          variant="destructive"
          size="sm"
          disabled={deletedTotal === 0}
          onClick={onEmptyTrash}
        >
          Xóa hết
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sản phẩm</TableHead>
                <TableHead>Danh mục</TableHead>
                <TableHead className="text-right">Giá Chợ Tốt</TableHead>
                <TableHead>Đã xóa</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deletedProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Thùng rác đang trống.
                  </TableCell>
                </TableRow>
              )}
              {deletedProducts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-md font-medium">
                    <Tooltip>
                      <TooltipTrigger className="block w-full cursor-help truncate text-left">
                        {p.title}
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        align="start"
                        className="max-w-md whitespace-pre-wrap break-words text-left leading-relaxed"
                      >
                        {p.content?.trim()
                          ? p.content
                          : "Chưa có nội dung mô tả cho tin này."}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.category}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatPrice(p.price)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateTime(p.deleted_at || p.created_at)}
                  </TableCell>
                  <TableCell className="space-x-2">
                    <Button variant="outline" size="sm" onClick={() => onRestore(p.id)}>
                      Khôi phục
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => onHardDelete(p.id)}
                    >
                      Xóa vĩnh viễn
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={deletedPage <= 1}
            onClick={() => onPageChange(deletedPage - 1)}
          >
            Trước
          </Button>
          <span className="text-sm text-muted-foreground">
            Trang {deletedPage}/{deletedTotalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={deletedPage >= deletedTotalPages}
            onClick={() => onPageChange(deletedPage + 1)}
          >
            Sau
          </Button>
        </div>
      </CardContent>
    </>
  );
}

export const TrashPanel = memo(TrashPanelInner);
