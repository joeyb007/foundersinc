import { GitPullRequestArrow } from "lucide-react";

import { cn } from "@/lib/utils";
import { AGENTS, type AgentType, type Effort, type Priority, type TicketStatus } from "@/lib/orchestrator";

// Agents own hue — each specialist reads as its own identity at a glance.
// Statuses own shape: a pill with a dot, in a lower-saturation palette, so a
// row never reads as two competing colors.
// Tailwind can't see interpolated class names, so each hue is written out in
// full rather than composed from the color name.
const AGENT_STYLES: Record<AgentType, { tile: string; text: string; lane: string; rail: string }> = {
  ui: {
    tile: "bg-indigo-100 text-indigo-700 ring-indigo-200",
    text: "text-indigo-700",
    lane: "bg-indigo-50/60",
    rail: "bg-indigo-500",
  },
  ux: {
    tile: "bg-violet-100 text-violet-700 ring-violet-200",
    text: "text-violet-700",
    lane: "bg-violet-50/60",
    rail: "bg-violet-500",
  },
  swe: {
    tile: "bg-orange-100 text-orange-700 ring-orange-200",
    text: "text-orange-700",
    lane: "bg-orange-50/60",
    rail: "bg-orange-500",
  },
  mobile: {
    tile: "bg-pink-100 text-pink-700 ring-pink-200",
    text: "text-pink-700",
    lane: "bg-pink-50/60",
    rail: "bg-pink-500",
  },
  devops: {
    tile: "bg-slate-200 text-slate-700 ring-slate-300",
    text: "text-slate-700",
    lane: "bg-slate-100/60",
    rail: "bg-slate-500",
  },
  qa: {
    tile: "bg-teal-100 text-teal-700 ring-teal-200",
    text: "text-teal-700",
    lane: "bg-teal-50/60",
    rail: "bg-teal-500",
  },
  security: {
    tile: "bg-red-100 text-red-700 ring-red-200",
    text: "text-red-700",
    lane: "bg-red-50/60",
    rail: "bg-red-500",
  },
  ml: {
    tile: "bg-rose-100 text-rose-700 ring-rose-200",
    text: "text-rose-700",
    lane: "bg-rose-50/60",
    rail: "bg-rose-500",
  },
  ds: {
    tile: "bg-cyan-100 text-cyan-700 ring-cyan-200",
    text: "text-cyan-700",
    lane: "bg-cyan-50/60",
    rail: "bg-cyan-500",
  },
  dataeng: {
    tile: "bg-sky-100 text-sky-700 ring-sky-200",
    text: "text-sky-700",
    lane: "bg-sky-50/60",
    rail: "bg-sky-500",
  },
  pm: {
    tile: "bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-200",
    text: "text-fuchsia-700",
    lane: "bg-fuchsia-50/60",
    rail: "bg-fuchsia-500",
  },
  docs: {
    tile: "bg-stone-200 text-stone-700 ring-stone-300",
    text: "text-stone-700",
    lane: "bg-stone-100/60",
    rail: "bg-stone-500",
  },
};

export function agentStyles(type: AgentType) {
  return AGENT_STYLES[type];
}

/** Square mono tile carrying the agent's type. Deliberately not a person
 *  avatar — nothing here is assigned to a human. */
export function AgentTile({
  type,
  running = false,
  className,
}: {
  type: AgentType;
  running?: boolean;
  className?: string;
}) {
  return (
    <span
      title={`${AGENTS[type].name} · ${AGENTS[type].role}`}
      className={cn(
        "relative inline-flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-semibold tracking-tight uppercase ring-1 ring-inset",
        AGENT_STYLES[type].tile,
        className
      )}
    >
      {AGENTS[type].code}
      {running && (
        <span className="absolute -top-0.5 -right-0.5 flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-amber-500 ring-1 ring-white" />
        </span>
      )}
    </span>
  );
}

export function AgentChip({ type, running }: { type: AgentType; running?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <AgentTile type={type} running={running} />
      <span className="truncate text-sm text-foreground">{AGENTS[type].name}</span>
    </span>
  );
}

const STATUS_STYLES: Record<TicketStatus, { label: string; pill: string; dot: string }> = {
  proposed: {
    label: "Proposed",
    pill: "bg-zinc-100 text-zinc-600",
    dot: "bg-zinc-400",
  },
  approved: {
    label: "Approved",
    pill: "bg-sky-100 text-sky-700",
    dot: "bg-sky-500",
  },
  running: {
    label: "Running",
    pill: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
  },
  review: {
    label: "In review",
    pill: "bg-violet-100 text-violet-700",
    dot: "bg-violet-500",
  },
  done: {
    label: "Done",
    pill: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
  },
};

export function statusLabel(status: TicketStatus) {
  return STATUS_STYLES[status].label;
}

export function StatusPill({ status }: { status: TicketStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs font-medium",
        s.pill
      )}
    >
      <span className="relative flex size-1.5">
        {status === "running" && (
          <span className={cn("absolute inline-flex size-full animate-ping rounded-full", s.dot)} />
        )}
        <span className={cn("relative inline-flex size-1.5 rounded-full", s.dot)} />
      </span>
      {s.label}
    </span>
  );
}

const PRIORITY_STYLES: Record<Priority, { label: string; pill: string }> = {
  high: { label: "High", pill: "bg-red-100 text-red-700" },
  medium: { label: "Medium", pill: "bg-amber-100 text-amber-800" },
  low: { label: "Low", pill: "bg-emerald-100 text-emerald-700" },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const p = PRIORITY_STYLES[priority];
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-xs font-medium", p.pill)}>
      {p.label}
    </span>
  );
}

const EFFORT_STYLES: Record<Effort, { label: string; pill: string }> = {
  small: { label: "Small", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  medium: { label: "Medium", pill: "bg-amber-50 text-amber-800 ring-amber-200" },
  large: { label: "Large", pill: "bg-rose-50 text-rose-700 ring-rose-200" },
};

export function EffortBadge({ effort }: { effort: Effort }) {
  const e = EFFORT_STYLES[effort];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ring-1 ring-inset",
        e.pill
      )}
    >
      {e.label}
    </span>
  );
}

/** The payoff column: a real PR on a real repo.
 *
 *  Keyed on the URL alone. Requiring a parsed `prNumber` too would render a
 *  landed PR as an em-dash whenever the number didn't parse out of the URL —
 *  hiding the one thing the whole run exists to produce. */
export function PrLink({ prNumber, prUrl }: { prNumber?: number; prUrl?: string }) {
  if (!prUrl) {
    return <span className="font-mono text-xs text-muted-foreground/50">—</span>;
  }
  return (
    <a
      href={prUrl}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <GitPullRequestArrow className="size-3.5" />
      {prNumber ? `#${prNumber}` : "PR"}
    </a>
  );
}
