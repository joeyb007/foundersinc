"use client";

import { Check, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/** Presentational — the view owns the timers so it can flip phase on the last
 *  step rather than reaching back in here for completion. */
export function AgentProgress({
  steps,
  completed,
}: {
  steps: string[];
  completed: number;
}) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <p className="text-xs font-medium">Handing to the PM agent</p>
      <ul className="mt-3 grid gap-2.5">
        {steps.map((step, index) => {
          const done = index < completed;
          const active = index === completed;
          return (
            <li
              key={step}
              className={cn(
                "flex items-start gap-2 text-xs transition-opacity",
                done && "text-foreground",
                active && "text-foreground",
                !done && !active && "opacity-40"
              )}
            >
              <span className="mt-px flex size-3.5 shrink-0 items-center justify-center">
                {done ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : active ? (
                  <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                )}
              </span>
              <span className="leading-snug">{step}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
