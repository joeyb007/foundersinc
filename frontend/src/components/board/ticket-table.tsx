"use client";

import {
  AlignLeft,
  CaseSensitive,
  Clock,
  FileCode,
  GitPullRequestArrow,
  Hourglass,
  LoaderCircle,
  Network,
  Plus,
  Target,
} from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { AGENTS, formatUpdatedShort, type Ticket } from "@/lib/orchestrator";

import { AgentTile, EffortBadge, PrLink, PriorityBadge, StatusPill } from "./tokens";

// Widths are explicit because the table is `table-fixed`: columns then stay put
// as rows are filtered, sorted, or added, and long file paths truncate instead
// of stretching their column.
//
// These sum to ~94rem including the checkbox and add-property columns, which
// fits the 96rem content box at full width. Over-subscribing here makes the
// browser scale every column down and truncate content that should fit.
const COLUMNS = [
  { key: "ticket", label: "Ticket", icon: CaseSensitive, width: "w-[19rem]" },
  { key: "description", label: "Description", icon: AlignLeft, width: "w-[14rem]" },
  { key: "agent", label: "Agent", icon: Network, width: "w-[7.5rem]" },
  { key: "status", label: "Status", icon: LoaderCircle, width: "w-[7rem]" },
  { key: "pr", label: "Pull request", icon: GitPullRequestArrow, width: "w-[6.5rem]" },
  { key: "priority", label: "Priority", icon: Target, width: "w-[6rem]" },
  { key: "effort", label: "Effort", icon: Hourglass, width: "w-[5.5rem]" },
  { key: "touched", label: "Touched", icon: FileCode, width: "w-[12rem]" },
  { key: "updated", label: "Updated", icon: Clock, width: "w-[9rem]" },
] as const;

const CELL = "truncate border-r border-b px-2";

export function TicketTable({
  tickets,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  onNewTicket,
}: {
  tickets: Ticket[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], checked: boolean) => void;
  onOpen: (ticket: Ticket) => void;
  onNewTicket: () => void;
}) {
  const allSelected = tickets.length > 0 && tickets.every((t) => selected.has(t.id));

  return (
    <div className="w-full">
      <Table className="min-w-[1280px] table-fixed border-separate border-spacing-0">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-9 border-r border-b pl-3">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) =>
                  onToggleAll(
                    tickets.map((t) => t.id),
                    checked === true
                  )
                }
                aria-label="Select every ticket in this view"
              />
            </TableHead>
            {COLUMNS.map(({ key, label, icon: Icon, width }) => (
              <TableHead
                key={key}
                className={cn(
                  "border-r border-b px-2 text-xs font-normal text-muted-foreground",
                  width
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Icon className="size-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{label}</span>
                </span>
              </TableHead>
            ))}
            {/* Notion's add-property slot. Real affordance, not a dead cell. */}
            <TableHead className="w-10 border-b p-0">
              <button
                type="button"
                onClick={onNewTicket}
                aria-label="Add a property"
                className="flex size-full items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Plus className="size-3.5" />
              </button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={COLUMNS.length + 2} className="py-14 text-center">
                <p className="text-sm text-muted-foreground">
                  No tickets match these filters.
                </p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Clear the search or pick a different agent.
                </p>
              </TableCell>
            </TableRow>
          ) : (
            tickets.map((ticket) => {
              const isSelected = selected.has(ticket.id);
              return (
                <TableRow
                  key={ticket.id}
                  data-state={isSelected ? "selected" : undefined}
                  className="group cursor-pointer"
                  onClick={() => onOpen(ticket)}
                >
                  <TableCell
                    className="border-r border-b pl-3"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggle(ticket.id)}
                      aria-label={`Select ${ticket.key}`}
                      className={cn(
                        "transition-opacity",
                        isSelected
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      )}
                    />
                  </TableCell>

                  <TableCell className={CELL}>
                    <span className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
                        {ticket.key}
                      </span>
                      <span className="truncate font-medium text-foreground group-hover:underline">
                        {ticket.title}
                      </span>
                    </span>
                  </TableCell>

                  <TableCell className={cn(CELL, "text-muted-foreground")}>
                    {ticket.body}
                  </TableCell>

                  <TableCell className={CELL}>
                    <span className="flex items-center gap-2">
                      <AgentTile
                        type={ticket.agentType}
                        running={ticket.status === "running"}
                      />
                      <span className="truncate text-foreground">
                        {AGENTS[ticket.agentType].name}
                      </span>
                    </span>
                  </TableCell>

                  <TableCell className={CELL}>
                    <StatusPill status={ticket.status} />
                  </TableCell>

                  <TableCell className={CELL}>
                    <span onClick={(event) => event.stopPropagation()}>
                      <PrLink prNumber={ticket.prNumber} prUrl={ticket.prUrl} />
                    </span>
                  </TableCell>

                  <TableCell className={CELL}>
                    <PriorityBadge priority={ticket.priority} />
                  </TableCell>

                  <TableCell className={CELL}>
                    <EffortBadge effort={ticket.effort} />
                  </TableCell>

                  <TableCell className={CELL}>
                    {ticket.filesTouched?.length ? (
                      <span
                        className="block truncate font-mono text-[11px] text-muted-foreground"
                        title={ticket.filesTouched[0]}
                      >
                        {ticket.filesTouched[0]}
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground/50">—</span>
                    )}
                  </TableCell>

                  <TableCell className={cn(CELL, "text-muted-foreground")}>
                    {formatUpdatedShort(ticket.updatedAt)}
                  </TableCell>

                  <TableCell className="border-b" />
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <button
        type="button"
        onClick={onNewTicket}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Plus className="size-4" />
        New ticket
      </button>
    </div>
  );
}
