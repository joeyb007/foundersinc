"use client";

import { ExternalLink, FileCode } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  AGENTS,
  MESSAGES,
  formatUpdatedAt,
  type MessageRole,
  type Ticket,
} from "@/lib/orchestrator";

import {
  AgentTile,
  EffortBadge,
  PriorityBadge,
  StatusPill,
  agentStyles,
} from "./tokens";

const ROLE_STYLES: Record<MessageRole, string> = {
  system: "text-muted-foreground",
  agent: "text-foreground",
  human: "text-sky-700",
};

const ROLE_LABELS: Record<MessageRole, string> = {
  system: "system",
  agent: "agent",
  human: "you",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-3 px-4 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TicketPanel({
  ticket,
  onOpenChange,
}: {
  ticket: Ticket | null;
  onOpenChange: (open: boolean) => void;
}) {
  const log = ticket ? MESSAGES.filter((m) => m.ticketId === ticket.id) : [];
  const agent = ticket ? AGENTS[ticket.agentType] : null;

  return (
    <Sheet open={Boolean(ticket)} onOpenChange={onOpenChange}>
      {/* The width override has to repeat SheetContent's own
          `data-[side=right]:sm:` modifier chain — a plain `sm:max-w-*` loses to
          it on specificity and tailwind-merge won't dedupe across modifiers. */}
      <SheetContent className="w-full gap-0 p-0 data-[side=right]:sm:max-w-2xl">
        {ticket && agent && (
          <>
            <SheetHeader className="gap-2 pr-12">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {ticket.key}
                </span>
                <StatusPill status={ticket.status} />
              </div>
              <SheetTitle className="text-lg leading-snug">
                {ticket.title}
              </SheetTitle>
              <SheetDescription className="leading-relaxed">
                {ticket.body}
              </SheetDescription>
            </SheetHeader>

            <Separator />

            <div className="py-2">
              <Field label="Agent">
                <span className="flex items-center gap-2">
                  <AgentTile
                    type={ticket.agentType}
                    running={ticket.status === "running"}
                  />
                  <span className="text-sm">{agent.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {agent.role}
                  </span>
                </span>
              </Field>
              <Field label="Toolset">
                <div className="flex flex-wrap gap-1">
                  {agent.tools.map((tool) => (
                    <span
                      key={tool}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </Field>
              <Field label="Priority">
                <PriorityBadge priority={ticket.priority} />
              </Field>
              <Field label="Effort">
                <EffortBadge effort={ticket.effort} />
              </Field>
              <Field label="Updated">
                <span className="text-sm text-muted-foreground">
                  {formatUpdatedAt(ticket.updatedAt)}
                </span>
              </Field>
              {ticket.filesTouched?.length ? (
                <Field label="Files">
                  <div className="space-y-1">
                    {ticket.filesTouched.map((file) => (
                      <div
                        key={file}
                        className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground"
                      >
                        <FileCode className="size-3 shrink-0" />
                        <span className="truncate">{file}</span>
                      </div>
                    ))}
                  </div>
                </Field>
              ) : null}
            </div>

            {ticket.status === "running" && (
              <div className="px-4 pb-3">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Progress</span>
                  <span className="font-mono text-xs text-amber-700">
                    {ticket.progress ?? 0}%
                  </span>
                </div>
                <Progress
                  value={ticket.progress ?? 0}
                  className="h-1.5 bg-amber-100 *:data-[slot=progress-indicator]:bg-amber-500"
                />
              </div>
            )}

            {ticket.prUrl && (
              <div className="px-4 pb-3">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <a href={ticket.prUrl} target="_blank" rel="noreferrer">
                    <span className="font-mono">
                      Open PR #{ticket.prNumber}
                    </span>
                    <ExternalLink data-icon="inline-end" />
                  </a>
                </Button>
              </div>
            )}

            <Separator />

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-baseline justify-between px-4 py-2.5">
                <span className="text-xs font-medium">Run log</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {log.length} {log.length === 1 ? "entry" : "entries"}
                </span>
              </div>
              <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
                {log.length === 0 ? (
                  <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                    No run yet. Approve this ticket to put {agent.name} to work.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {log.map((m) => (
                      <li key={m.id} className="flex gap-2.5 font-mono text-[11px]">
                        <span className="shrink-0 text-muted-foreground/70">
                          {m.at}
                        </span>
                        <span
                          className={cn(
                            "w-12 shrink-0",
                            m.role === "agent"
                              ? agentStyles(ticket.agentType).text
                              : "text-muted-foreground/70"
                          )}
                        >
                          {ROLE_LABELS[m.role]}
                        </span>
                        <span className={cn("min-w-0 leading-relaxed", ROLE_STYLES[m.role])}>
                          {m.content}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </ScrollArea>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
