"use client";

import { FileText } from "lucide-react";

import { formatBytes, type SourceDoc } from "@/lib/intake";

import { Markdown } from "./markdown";

export function DocPreview({ doc }: { doc: SourceDoc }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-xs text-muted-foreground">
          {doc.name}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground/70">
          {formatBytes(doc.bytes)}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-8">
          <Markdown source={doc.text} />
        </div>
      </div>
    </div>
  );
}
