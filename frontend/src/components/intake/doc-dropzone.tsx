"use client";

import { FileText, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ACCEPT_ATTRIBUTE,
  readDocFile,
  type SourceDoc,
} from "@/lib/intake";

export function DocDropzone({ onDoc }: { onDoc: (doc: SourceDoc) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Nested elements fire dragleave as the pointer crosses them, so track depth
  // rather than a boolean or the highlight flickers across the drop target.
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");

  async function accept(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      toast.info(`Using ${files[0].name}`, {
        description: "One document at a time — the rest were ignored.",
      });
    }
    try {
      onDoc(await readDocFile(files[0]));
    } catch (error) {
      toast.error("Could not use that file", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  function usePasted() {
    const text = pasted.trim();
    if (!text) return;
    onDoc({
      name: "Pasted spec",
      text,
      bytes: new Blob([text]).size,
    });
  }

  if (pasting) {
    return (
      <div className="flex h-full flex-col gap-3 p-6">
        <div>
          <h2 className="text-sm font-medium">Paste your epic</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Markdown is rendered in the preview. Plain prose works too.
          </p>
        </div>
        <Textarea
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          autoFocus
          placeholder={"# Realtime chat\n\nMembers need a live chat surface inside the portal.\n\n## Message history\n…"}
          className="min-h-0 flex-1 resize-none font-mono text-xs"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={usePasted} disabled={!pasted.trim()}>
            <FileText data-icon="inline-start" />
            Use this text
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPasting(false);
              setPasted("");
            }}
          >
            Upload a file instead
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => {
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          void accept(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          dragging ? "border-foreground bg-muted/60" : "border-border bg-muted/20"
        )}
      >
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-xl transition-colors",
            dragging ? "bg-foreground text-background" : "bg-background text-muted-foreground ring-1 ring-border"
          )}
        >
          <Upload className="size-5" />
        </span>

        <h2 className="mt-4 text-base font-medium text-foreground">
          Drop your epic or project spec
        </h2>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          A Markdown or text file describing what you want built. The planning
          agent reads it and proposes the ticket set.
        </p>

        <div className="mt-5 flex items-center gap-2">
          <Button size="sm" onClick={() => inputRef.current?.click()}>
            <FileText data-icon="inline-start" />
            Choose a file
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPasting(true)}>
            Paste text instead
          </Button>
        </div>

        <p className="mt-5 font-mono text-[11px] text-muted-foreground/70">
          .md · .markdown · .txt — up to 1 MB
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="hidden"
          onChange={(event) => {
            void accept(event.target.files);
            // Reset so picking the same file twice still fires a change.
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
