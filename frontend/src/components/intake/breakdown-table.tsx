"use client";

import { CaseSensitive, ChevronRight, Hourglass, LoaderCircle, Network, Target } from "lucide-react";
import { Fragment, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { AGENTS, type Ticket } from "@/lib/orchestrator";

import { AgentTile, EffortBadge, PriorityBadge } from "../board/tokens";

// The summary view: the four columns you need to judge a proposed ticket set.
// Description, PR, touched files and timestamps only mean something once a run
// exists, so they live on the board's full table rather than here.
const COLUMNS = [
  { key: "ticket", label: "Ticket", icon: CaseSensitive },
  { key: "agent", label: "Agent", icon: Network },
  { key: "priority", label: "Priority", icon: Target },
  { key: "effort", label: "Effort", icon: Hourglass },
] as const;

export function BreakdownTable({ tickets }: { tickets: Ticket[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (tickets.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
        <LoaderCircle className="size-5 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">No tickets yet.</p>
        <p className="text-xs text-muted-foreground/70">
          Hand the document to the PM agent, or add tickets yourself.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* table-fixed so a long ticket title truncates in its column instead of
          widening the table past the pane and sliding under the rail. */}
      <Table className="w-full table-fixed border-separate border-spacing-0">
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow className="hover:bg-transparent">
            {COLUMNS.map(({ key, label, icon: Icon }, index) => (
              <TableHead
                key={key}
                className={cn(
                  "border-b px-3 text-xs font-normal text-muted-foreground",
                  index === 0 ? "w-auto" : "w-[7.5rem]"
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Icon className="size-3.5 shrink-0 opacity-70" />
                  {label}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {tickets.map((ticket) => {
            const isOpen = expanded === ticket.id;
            return (
              <Fragment key={ticket.id}>
                <TableRow
                  className="group cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : ticket.id)}
                >
                  <TableCell className="truncate border-b px-3">
                    <span className="flex items-center gap-2">
                      <ChevronRight
                        className={cn(
                          "size-3.5 shrink-0 text-muted-foreground/60 transition-transform",
                          isOpen && "rotate-90"
                        )}
                      />
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
                        {ticket.key}
                      </span>
                      <span className="truncate font-medium text-foreground">
                        {ticket.title}
                      </span>
                    </span>
                  </TableCell>

                  <TableCell className="border-b px-3">
                    <span className="flex items-center gap-2">
                      <AgentTile type={ticket.agentType} />
                      <span className="truncate text-foreground">
                        {AGENTS[ticket.agentType].name}
                      </span>
                    </span>
                  </TableCell>

                  <TableCell className="border-b px-3">
                    <PriorityBadge priority={ticket.priority} />
                  </TableCell>

                  <TableCell className="border-b px-3">
                    <EffortBadge effort={ticket.effort} />
                  </TableCell>
                </TableRow>

                {isOpen && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={COLUMNS.length}
                      className="border-b bg-muted/30 px-3 py-3 whitespace-normal"
                    >
                      <p className="max-w-3xl pl-[1.4rem] text-sm text-muted-foreground">
                        {ticket.body || "No description yet."}
                      </p>
                      <p className="mt-2 pl-[1.4rem] font-mono text-[11px] text-muted-foreground/60">
                        {AGENTS[ticket.agentType].role} · toolset{" "}
                        {AGENTS[ticket.agentType].tools.join(", ")}
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
