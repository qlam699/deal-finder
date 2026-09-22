"use client";

import { useEffect, useState, memo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function ProductTitlePreviewInner({
  title,
  content,
  url,
}: {
  title: string;
  content?: string | null;
  url: string;
}) {
  const [open, setOpen] = useState(false);
  const [hoverCapable, setHoverCapable] = useState(false);
  const description = content?.trim() || "Chưa có nội dung mô tả cho tin này.";

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setHoverCapable(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="block w-full truncate text-left cursor-pointer underline-offset-2 hover:underline"
    >
      {title}
    </button>
  );

  return (
    <>
      {hoverCapable ? (
        <Tooltip>
          <TooltipTrigger render={trigger} />
          <TooltipContent
            side="bottom"
            align="start"
            className="max-w-md whitespace-pre-wrap break-words text-left leading-relaxed"
          >
            {description}
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-left leading-snug">
              <a href={url} target="_blank" rel="noopener noreferrer">
                {title + " - Click xem"}
              </a>
            </DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words text-left leading-relaxed text-sm">
            {description}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const ProductTitlePreview = memo(ProductTitlePreviewInner);
