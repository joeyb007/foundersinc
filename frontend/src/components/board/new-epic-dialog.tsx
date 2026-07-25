"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AGENT_TYPES, AGENTS } from "@/lib/orchestrator";

import { AgentTile } from "./tokens";

export function NewEpicDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit an epic</DialogTitle>
          <DialogDescription>
            Describe the outcome you want. The planning agent breaks it into
            tickets and routes each one to a specialist for you to approve.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="epic-body">Epic</Label>
          <Textarea
            id="epic-body"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={5}
            placeholder="Members need a live chat surface inside the portal, with message history and presence."
            className="resize-none"
          />
        </div>

        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium">Available specialists</p>
          <div className="mt-2 grid gap-1.5">
            {AGENT_TYPES.map((type) => (
              <div key={type} className="flex items-center gap-2">
                <AgentTile type={type} />
                <span className="text-xs font-medium">{AGENTS[type].name}</span>
                <span className="text-xs text-muted-foreground">
                  {AGENTS[type].role}
                </span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!text.trim()}>
            <Sparkles data-icon="inline-start" />
            Decompose into tickets
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
