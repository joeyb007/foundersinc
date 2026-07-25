"use client";

import { ChevronRight } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { AGENTS, type Ticket } from "@/lib/orchestrator";
import { AGENT_TIER, TIER_LABEL, groupIntoWaves } from "../../../convex/graph";

import { AgentTile } from "./tokens";

type WaveState = "waiting" | "running" | "done";

/** The org chart, filtered to the roles this epic actually routed to, with each
 *  wave lit by what its tickets are doing right now.
 *
 *  This is the execution plan made visible: the orchestrator runs these left to
 *  right, and everything inside one column at the same time. Without it the
 *  ordering is invisible and the board just looks like some agents are
 *  inexplicably idle. */
export function PipelineGraph({ tickets }: { tickets: Ticket[] }) {
  const waves = useMemo(() => {
    // Sorted so a wave's tiles don't reshuffle as statuses change underneath.
    const grouped = groupIntoWaves([...tickets].sort((a, b) => a.key.localeCompare(b.key)));
    return grouped.map((wave) => {
      const state: WaveState = wave.some((t) => t.status === "running")
        ? "running"
        : wave.every((t) => t.status === "done")
          ? "done"
          : "waiting";
      return {
        tier: AGENT_TIER[wave[0].agentType],
        tickets: wave,
        state,
        done: wave.filter((t) => t.status === "done").length,
      };
    });
  }, [tickets]);

  if (waves.length === 0) return null;

  return (
    <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
      {waves.map((wave, index) => (
        <div key={wave.tier} className="flex items-stretch gap-1">
          <div
            className={cn(
              "min-w-[8.5rem] rounded-lg border px-2.5 py-2 transition-colors",
              wave.state === "running" && "border-amber-300 bg-amber-50/60",
              wave.state === "done" && "border-emerald-200 bg-emerald-50/40",
              wave.state === "waiting" && "bg-muted/30"
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
                {TIER_LABEL[wave.tier] ?? `Wave ${index + 1}`}
              </span>
              <span
                className={cn(
                  "font-mono text-[10px]",
                  wave.state === "running" && "text-amber-700",
                  wave.state === "done" && "text-emerald-700",
                  wave.state === "waiting" && "text-muted-foreground/60"
                )}
              >
                {wave.done}/{wave.tickets.length}
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {wave.tickets.map((ticket) => (
                <AgentTile
                  key={ticket.id}
                  type={ticket.agentType}
                  running={ticket.status === "running"}
                  className={cn(ticket.status === "done" && "opacity-45")}
                />
              ))}
            </div>

            <p className="mt-1 truncate text-[10px] text-muted-foreground/70">
              {[...new Set(wave.tickets.map((t) => AGENTS[t.agentType].name))].join(", ")}
            </p>
          </div>

          {index < waves.length - 1 && (
            <ChevronRight className="size-3.5 shrink-0 self-center text-muted-foreground/40" />
          )}
        </div>
      ))}
    </div>
  );
}
