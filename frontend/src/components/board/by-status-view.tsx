"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { AGENTS, TICKET_STATUSES, type Ticket, type TicketStatus } from "@/lib/orchestrator";

import { AgentTile, EffortBadge, PrLink, PriorityBadge, statusLabel } from "./tokens";

const STATUS_ACCENT: Record<TicketStatus, string> = {
  proposed: "bg-zinc-400",
  approved: "bg-sky-500",
  running: "bg-amber-500",
  review: "bg-violet-500",
  done: "bg-emerald-500",
};

function StatusGroup({
  status,
  tickets,
  onOpen,
}: {
  status: TicketStatus;
  tickets: Ticket[];
  onOpen: (ticket: Ticket) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 border-b px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <ChevronRight
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            open && "rotate-90"
          )}
        />
        <span className={cn("size-1.5 rounded-full", STATUS_ACCENT[status])} />
        <span className="text-sm font-medium">{statusLabel(status)}</span>
        <span className="font-mono text-xs text-muted-foreground">{tickets.length}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {tickets.length === 0 ? (
          <p className="border-b px-3 py-3 pl-10 text-xs text-muted-foreground">
            Nothing here yet.
          </p>
        ) : (
          tickets.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => onOpen(ticket)}
              className="flex w-full items-center gap-3 border-b px-3 py-2 pl-10 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <AgentTile type={ticket.agentType} running={ticket.status === "running"} />
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
                {ticket.key}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{ticket.title}</span>
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {AGENTS[ticket.agentType].name}
              </span>
              <PriorityBadge priority={ticket.priority} />
              <EffortBadge effort={ticket.effort} />
              <PrLink prNumber={ticket.prNumber} prUrl={ticket.prUrl} />
            </button>
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ByStatusView({
  tickets,
  onOpen,
}: {
  tickets: Ticket[];
  onOpen: (ticket: Ticket) => void;
}) {
  return (
    <div>
      {TICKET_STATUSES.map((status) => (
        <StatusGroup
          key={status}
          status={status}
          tickets={tickets.filter((t) => t.status === status)}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
