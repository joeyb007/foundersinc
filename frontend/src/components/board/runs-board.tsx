"use client";

import { GitPullRequestArrow } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";
import {
  AGENTS,
  AGENT_TYPES,
  type AgentType,
  type Message,
  type Ticket,
} from "@/lib/orchestrator";

import { AgentTile, StatusPill, agentStyles } from "./tokens";

function RunCard({
  ticket,
  log,
  onOpen,
}: {
  ticket: Ticket;
  log: Message[];
  onOpen: (ticket: Ticket) => void;
}) {
  const isRunning = ticket.status === "running";

  return (
    <button
      type="button"
      onClick={() => onOpen(ticket)}
      className={cn(
        "w-full rounded-lg border bg-card p-2.5 text-left transition-all hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        isRunning && "border-amber-300 shadow-sm ring-1 ring-amber-100"
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
          {ticket.key}
        </span>
        {ticket.prNumber && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-mono text-[11px] font-medium text-emerald-700">
            <GitPullRequestArrow className="size-3" />#{ticket.prNumber}
          </span>
        )}
      </div>

      <p className="mt-1 line-clamp-2 text-xs leading-snug font-medium">
        {ticket.title}
      </p>

      <div className="mt-2">
        <StatusPill status={ticket.status} />
      </div>

      {/* A coding agent doesn't report percent-complete, so the honest live
          signal is the step count plus an indeterminate bar — not a fake
          progress number counting up on a timer. */}
      {isRunning && (
        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded-full bg-amber-100">
            <div className="h-full animate-pulse rounded-full bg-amber-500" />
          </div>
          <span className="mt-1 block font-mono text-[10px] text-amber-700">
            {ticket.steps} {ticket.steps === 1 ? "step" : "steps"}
          </span>
        </div>
      )}

      {log.length > 0 && (
        <ol className="mt-2 space-y-0.5 border-t pt-2">
          {log.slice(-3).map((m) => (
            <li
              key={m.id}
              className="flex gap-1.5 font-mono text-[10px] leading-relaxed"
            >
              <span className="shrink-0 text-muted-foreground/60">{m.at}</span>
              {/* Neutral on purpose: the lane rail already says which agent
                  this is, and a red-ish hue here reads as an error. */}
              <span
                className={cn(
                  "line-clamp-1",
                  m.role === "agent" ? "text-foreground/80" : "text-muted-foreground/70"
                )}
              >
                {m.content}
              </span>
            </li>
          ))}
        </ol>
      )}
    </button>
  );
}

function Lane({
  type,
  tickets,
  messages,
  onOpen,
}: {
  type: AgentType;
  tickets: Ticket[];
  messages: Map<string, Message[]>;
  onOpen: (ticket: Ticket) => void;
}) {
  const agent = AGENTS[type];
  const styles = agentStyles(type);
  const running = tickets.filter((t) => t.status === "running").length;

  return (
    <div className="flex min-w-0 flex-col rounded-xl border bg-muted/20">
      {/* The rail is the agent's hue — a row of colors across the top says
          "specialists working at once" before you read a word. */}
      <div className={cn("h-1 rounded-t-xl", styles.rail)} />

      <div className={cn("flex items-center gap-2 px-2.5 py-2", styles.lane)}>
        <AgentTile type={type} running={running > 0} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{agent.name}</p>
          <p className="truncate text-[10px] text-muted-foreground">{agent.role}</p>
        </div>
        {running > 0 ? (
          <span className="shrink-0 font-mono text-[10px] font-medium text-amber-700">
            live
          </span>
        ) : (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
            idle
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-b px-2.5 pb-2">
        {agent.focus.map((item) => (
          <span
            key={item}
            className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
          >
            {item}
          </span>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-2">
        {tickets.map((ticket) => (
          <RunCard
            key={ticket.id}
            ticket={ticket}
            log={messages.get(ticket.id) ?? []}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}

export function RunsBoard({
  tickets,
  messages,
  onOpen,
}: {
  tickets: Ticket[];
  messages: Message[];
  onOpen: (ticket: Ticket) => void;
}) {
  const runningCount = tickets.filter((t) => t.status === "running").length;
  const shipped = tickets.filter((t) => t.prUrl).length;

  const byTicket = useMemo(() => {
    const map = new Map<string, Message[]>();
    for (const m of messages) {
      const list = map.get(m.ticketId);
      if (list) list.push(m);
      else map.set(m.ticketId, [m]);
    }
    return map;
  }, [messages]);

  // Only the roles this epic actually routed to. Rendering all twelve would
  // bury four live lanes in eight empty ones.
  const lanes = useMemo(
    () => AGENT_TYPES.filter((type) => tickets.some((t) => t.agentType === type)),
    [tickets],
  );

  if (lanes.length === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-sm font-medium">Nothing routed yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Approve a ticket set and its agents show up here as they start.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-sm font-medium">Execution board</h2>
        <p className="text-xs text-muted-foreground">
          {runningCount > 0 ? (
            <>
              <span className="font-mono font-medium text-amber-700">
                {runningCount}
              </span>{" "}
              agents working right now ·{" "}
            </>
          ) : (
            "All agents idle · "
          )}
          <span className="font-mono font-medium text-emerald-700">{shipped}</span>{" "}
          {shipped === 1 ? "PR" : "PRs"} opened
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {lanes.map((type) => (
          <Lane
            key={type}
            type={type}
            tickets={tickets.filter((t) => t.agentType === type)}
            messages={byTicket}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
