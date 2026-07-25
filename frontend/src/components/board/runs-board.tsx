"use client";

import { GitPullRequestArrow } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  AGENTS,
  AGENT_TYPES,
  MESSAGES,
  type AgentType,
  type Ticket,
} from "@/lib/orchestrator";

import { AgentTile, StatusPill, agentStyles } from "./tokens";

/** Log lines are revealed as the run advances, so a lane visibly fills up. */
function visibleLog(ticket: Ticket) {
  const log = MESSAGES.filter((m) => m.ticketId === ticket.id);
  if (ticket.status === "done" || ticket.status === "review") return log;
  if (ticket.status !== "running") return [];
  const shown = Math.max(1, Math.ceil((log.length * (ticket.progress ?? 0)) / 100));
  return log.slice(0, shown);
}

function RunCard({
  ticket,
  onOpen,
}: {
  ticket: Ticket;
  onOpen: (ticket: Ticket) => void;
}) {
  const isRunning = ticket.status === "running";
  const log = visibleLog(ticket);

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

      {isRunning && (
        <div className="mt-2">
          <Progress
            value={ticket.progress ?? 0}
            className="h-1 bg-amber-100 *:data-[slot=progress-indicator]:bg-amber-500"
          />
          <span className="mt-1 block font-mono text-[10px] text-amber-700">
            {ticket.progress ?? 0}%
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
  onOpen,
}: {
  type: AgentType;
  tickets: Ticket[];
  onOpen: (ticket: Ticket) => void;
}) {
  const agent = AGENTS[type];
  const styles = agentStyles(type);
  const running = tickets.filter((t) => t.status === "running").length;

  return (
    <div className="flex min-w-0 flex-col rounded-xl border bg-muted/20">
      {/* The rail is the agent's hue — four colors across the top says
          "four specialists working at once" before you read a word. */}
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
        {agent.tools.map((tool) => (
          <span
            key={tool}
            className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
          >
            {tool}
          </span>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-2">
        {tickets.length === 0 ? (
          <p className="px-1 py-6 text-center text-[11px] text-muted-foreground/70">
            No tickets routed here.
          </p>
        ) : (
          tickets.map((ticket) => (
            <RunCard key={ticket.id} ticket={ticket} onOpen={onOpen} />
          ))
        )}
      </div>
    </div>
  );
}

export function RunsBoard({
  tickets,
  onOpen,
}: {
  tickets: Ticket[];
  onOpen: (ticket: Ticket) => void;
}) {
  const runningCount = tickets.filter((t) => t.status === "running").length;
  const shipped = tickets.filter((t) => t.prUrl).length;

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
        {AGENT_TYPES.map((type) => (
          <Lane
            key={type}
            type={type}
            tickets={tickets.filter((t) => t.agentType === type)}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
