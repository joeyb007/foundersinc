"use client";

import { CircleCheckBig, Play, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { AGENTS, AGENT_TYPES, type Ticket } from "@/lib/orchestrator";

import { AgentTile, EffortBadge, PriorityBadge, agentStyles } from "./tokens";

export type Approver = { id: string; name: string; initials: string; signed: boolean };

export function ApprovalQueue({
  tickets,
  selected,
  approvers,
  onToggle,
  onToggleApprover,
  onApproveAndRun,
  onOpen,
}: {
  tickets: Ticket[];
  selected: Set<string>;
  approvers: Approver[];
  onToggle: (id: string) => void;
  onToggleApprover: (id: string) => void;
  onApproveAndRun: () => void;
  onOpen: (ticket: Ticket) => void;
}) {
  const proposed = tickets.filter((t) => t.status === "proposed");
  const chosen = proposed.filter((t) => selected.has(t.id));
  const allSigned = approvers.every((a) => a.signed);
  const canRun = chosen.length > 0 && allSigned;

  if (proposed.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <CircleCheckBig className="size-5 text-emerald-600" />
        <p className="text-sm font-medium">Queue is clear</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Every proposed ticket has been approved. Submit a new epic to get
          another decomposition.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="border-b px-3 py-3">
        <h2 className="text-sm font-medium">
          {proposed.length} tickets waiting on you
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          The orchestrator picked an agent for each one. Approve the set and they
          run in parallel.
        </p>
      </div>

      {/* Grouped by agent so the "org chart of specialists" reads at a glance. */}
      {AGENT_TYPES.map((type) => {
        const group = proposed.filter((t) => t.agentType === type);
        if (group.length === 0) return null;
        const agent = AGENTS[type];

        return (
          <div key={type}>
            <div
              className={cn(
                "flex items-center gap-2 border-b px-3 py-1.5",
                agentStyles(type).lane
              )}
            >
              <AgentTile type={type} />
              <span className="text-xs font-medium">{agent.name}</span>
              <span className="text-xs text-muted-foreground">{agent.role}</span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {group.length} {group.length === 1 ? "ticket" : "tickets"}
              </span>
            </div>
            {group.map((ticket) => {
              const isSelected = selected.has(ticket.id);
              return (
                <div
                  key={ticket.id}
                  className={cn(
                    "flex items-center gap-3 border-b px-3 py-2.5 transition-colors",
                    isSelected ? "bg-sky-50/50" : "hover:bg-muted/40"
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggle(ticket.id)}
                    aria-label={`Approve ${ticket.key}`}
                  />
                  <button
                    type="button"
                    onClick={() => onOpen(ticket)}
                    className="flex min-w-0 flex-1 items-baseline gap-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
                      {ticket.key}
                    </span>
                    <span className="truncate text-sm font-medium hover:underline">
                      {ticket.title}
                    </span>
                  </button>
                  <PriorityBadge priority={ticket.priority} />
                  <EffortBadge effort={ticket.effort} />
                </div>
              );
            })}
          </div>
        );
      })}

      {/* The gate itself. Every approver signs before anything runs. */}
      <div className="sticky bottom-0 border-t bg-background/95 px-3 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck
              className={cn(
                "size-4",
                allSigned ? "text-emerald-600" : "text-muted-foreground"
              )}
            />
            <span className="text-xs font-medium">Approvers</span>
          </div>

          <div className="flex items-center gap-4">
            {approvers.map((approver) => (
              <label
                key={approver.id}
                className="flex cursor-pointer items-center gap-2 text-xs"
              >
                <Checkbox
                  checked={approver.signed}
                  onCheckedChange={() => onToggleApprover(approver.id)}
                />
                <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                  {approver.initials}
                </span>
                <span
                  className={cn(
                    approver.signed ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {approver.name}
                </span>
              </label>
            ))}
          </div>

          <Separator orientation="vertical" className="hidden h-6 sm:block" />

          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {chosen.length === 0
                ? "Select tickets to approve"
                : !allSigned
                  ? "Waiting on every approver to sign"
                  : `${chosen.length} ready to run in parallel`}
            </span>
            <Button size="sm" disabled={!canRun} onClick={onApproveAndRun}>
              <Play data-icon="inline-start" />
              Approve &amp; run{chosen.length > 0 ? ` ${chosen.length}` : ""}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
