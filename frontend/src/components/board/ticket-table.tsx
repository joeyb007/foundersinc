"use client";

import {
  AlignLeft,
  CaseSensitive,
  ChevronDown,
  Clock,
  FileCode,
  GitPullRequestArrow,
  Hourglass,
  LoaderCircle,
  Network,
  Plus,
  Target,
} from "lucide-react";
import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  AGENTS,
  AGENT_TYPES,
  formatUpdatedShort,
  type AgentType,
  type Ticket,
  type TicketStatus,
} from "@/lib/orchestrator";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { AgentTile, EffortBadge, PrLink, PriorityBadge, StatusPill, statusLabel } from "./tokens";

// "running" is missing on purpose — only the orchestrator's fan-out starts a
// run, so offering it here would fake a working agent.
const MANUAL_STATUSES: TicketStatus[] = ["proposed", "approved", "review", "done"];

/** The status pill as a menu: click it to move the ticket by hand. */
function StatusMenu({ ticket }: { ticket: Ticket }) {
  const updateStatus = useMutation(api.tickets.updateStatus);

  async function setStatus(status: TicketStatus) {
    if (status === ticket.status || status === "running") return;
    try {
      await updateStatus({ ticketId: ticket.id as Id<"tickets">, status });
    } catch (error) {
      toast.error(`Could not update ${ticket.key}`, {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Change status of ${ticket.key}`}
          className="group/status inline-flex items-center gap-1 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <StatusPill status={ticket.status} />
          <ChevronDown className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover/status:opacity-100 group-data-[state=open]/status:opacity-100" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Set status</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={ticket.status}
          onValueChange={(value) => void setStatus(value as TicketStatus)}
        >
          {MANUAL_STATUSES.map((status) => (
            <DropdownMenuRadioItem key={status} value={status}>
              {statusLabel(status)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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

/** Inline row composer: adds a ticket to this epic without leaving the board.
 *  Stays open after each add so a batch of tickets goes in without re-opening. */
function NewTicketRow({ epicId, onClose }: { epicId: Id<"epics">; onClose: () => void }) {
  const createTicket = useMutation(api.tickets.create);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [agentType, setAgentType] = useState<AgentType>("swe");
  const inputRef = useRef<HTMLInputElement>(null);

  async function add() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const trimmedBody = body.trim();
    setTitle("");
    setBody("");
    inputRef.current?.focus();
    try {
      await createTicket({ epicId, title: trimmedTitle, body: trimmedBody, agentType });
    } catch (error) {
      setTitle(trimmedTitle);
      setBody(trimmedBody);
      toast.error("Could not add the ticket", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function handleKeys(event: React.KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void add();
    }
    if (event.key === "Escape") onClose();
  }

  return (
    <div className="grid gap-2 border-b bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Select value={agentType} onValueChange={(value) => setAgentType(value as AgentType)}>
          <SelectTrigger size="sm" className="w-44 shrink-0" aria-label="Assign a specialist">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AGENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                <AgentTile type={type} className="size-5 text-[9px]" />
                {AGENTS[type].name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          ref={inputRef}
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void add();
            }
            if (event.key === "Escape") onClose();
          }}
          placeholder="Ticket title — Enter to add, Esc to close"
          className="h-8 flex-1 text-sm"
        />
      </div>
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={handleKeys}
        rows={2}
        placeholder="Description (optional) — what exactly should this specialist build? ⌘Enter to add."
        className="min-h-16 resize-y text-sm"
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          The description is the agent&apos;s brief — the more specific, the better the PR.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => void add()}
          disabled={!title.trim()}
        >
          <Plus data-icon="inline-start" />
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

export function TicketTable({
  tickets,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  epicId,
}: {
  tickets: Ticket[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], checked: boolean) => void;
  onOpen: (ticket: Ticket) => void;
  epicId: Id<"epics"> | null;
}) {
  const allSelected = tickets.length > 0 && tickets.every((t) => selected.has(t.id));
  const [composing, setComposing] = useState(false);

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
            <TableHead className="w-10 border-b p-0">
              <button
                type="button"
                onClick={() => setComposing(true)}
                aria-label="Add a ticket"
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

                  <TableCell
                    className={CELL}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <StatusMenu ticket={ticket} />
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

      {composing && epicId ? (
        <NewTicketRow epicId={epicId} onClose={() => setComposing(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          disabled={!epicId}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
        >
          <Plus className="size-4" />
          New ticket
        </button>
      )}
    </div>
  );
}
