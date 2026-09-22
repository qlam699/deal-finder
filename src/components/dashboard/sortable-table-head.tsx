"use client";

import { memo } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import type { SortOrder } from "@/lib/dashboard/types";

function SortableTableHeadInner({
  label,
  column,
  sortBy,
  sortOrder,
  onSort,
  className,
}: {
  label: string;
  column: string;
  sortBy: string;
  sortOrder: SortOrder;
  onSort: (column: string) => void;
  className?: string;
}) {
  const isActive = sortBy === column;
  const isRight = className?.includes("text-right");
  return (
    <TableHead className={className}>
      <div className={isRight ? "flex justify-end" : undefined}>
        <button
          type="button"
          onClick={() => onSort(column)}
          className="inline-flex items-center gap-1 font-medium hover:text-foreground/80 transition-colors"
        >
          {label}
          {isActive ? (
            sortOrder === "asc" ? (
              <ArrowUp className="size-3.5 shrink-0" />
            ) : (
              <ArrowDown className="size-3.5 shrink-0" />
            )
          ) : (
            <ArrowUpDown className="size-3.5 shrink-0 opacity-40" />
          )}
        </button>
      </div>
    </TableHead>
  );
}

export const SortableTableHead = memo(SortableTableHeadInner);
