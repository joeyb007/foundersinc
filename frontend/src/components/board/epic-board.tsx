"use client";

import {
  ArrowUpDown,
  CircleDot,
  GitBranch,
  ListChecks,
  ListFilter,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  UserCheck,
} from "lucide-react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useEpicBoard } from "@/lib/board-data";
import {
  AGENTS,
  AGENT_TYPES,
  APPROVERS,
  EFFORT_ORDER,
  PRIORITY_ORDER,
  type AgentType,
} from "@/lib/orchestrator";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { ApprovalQueue, type Approver } from "./approval-queue";
import { ByStatusView } from "./by-status-view";
import { RunsBoard } from "./runs-board";
import { TicketPanel } from "./ticket-panel";
import { TicketTable } from "./ticket-table";
import { AgentTile } from "./tokens";

type SortKey = "updated" | "priority" | "effort" | "agent";

const SORT_LABELS: Record<SortKey, string> = {
  updated: "Last updated",
  priority: "Priority",
  effort: "Effort",
  agent: "Agent",
};

export function EpicBoard({ epicId: rawEpicId }: { epicId?: string }) {
  const router = useRouter();

  // Everything below the fold is a live Convex subscription: tickets flip
  // status, log lines stream in, and PR links appear without a refresh or a
  // single poll. Nothing here simulates progress.
  const { epic, epicId, tickets, messages, isLoading, isEmpty } =
    useEpicBoard(rawEpicId);
  const approveAndRunTickets = useMutation(api.orchestrator.approveAndRun);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approvers, setApprovers] = useState<Approver[]>(APPROVERS);
  const [query, setQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState<Set<AgentType>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [compact, setCompact] = useState(false);
  // Track the id, not the object, so the panel follows its run as it advances.
  const [panelId, setPanelId] = useState<string | null>(null);

  const epicTitle = epic?.title ?? "Epic board";
  const panelTicket = tickets.find((t) => t.id === panelId) ?? null;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = tickets.filter((ticket) => {
      if (agentFilter.size > 0 && !agentFilter.has(ticket.agentType)) return false;
      if (!needle) return true;
      return (
        ticket.title.toLowerCase().includes(needle) ||
        ticket.body.toLowerCase().includes(needle) ||
        ticket.key.toLowerCase().includes(needle)
      );
    });

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "priority":
          return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        case "effort":
          return EFFORT_ORDER[a.effort] - EFFORT_ORDER[b.effort];
        case "agent":
          return a.agentType.localeCompare(b.agentType);
        default:
          return b.updatedAt.localeCompare(a.updatedAt);
      }
    });
  }, [tickets, query, agentFilter, sortKey]);

  // Only the roles this epic actually routed to. The roster is twelve; showing
  // all of them would drown the handful that are live.
  const presentTypes = useMemo(
    () => AGENT_TYPES.filter((type) => tickets.some((t) => t.agentType === type)),
    [tickets],
  );

  const proposedCount = tickets.filter((t) => t.status === "proposed").length;
  const runningCount = tickets.filter((t) => t.status === "running").length;
  const selectedCount = selected.size;

  function toggleTicket(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(ids: string[], checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  function toggleAgent(type: AgentType) {
    setAgentFilter((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleApprover(id: string) {
    setApprovers((current) =>
      current.map((a) => (a.id === id ? { ...a, signed: !a.signed } : a))
    );
  }

  /** The gate: one mutation approves the selected tickets and fans them out
   *  together, so they genuinely start in parallel rather than in sequence. */
  async function approveAndRun(ids: string[]) {
    if (!epicId || ids.length === 0) return;
    setSelected(new Set());
    try {
      const approved = await approveAndRunTickets({
        epicId,
        ticketIds: ids as Id<"tickets">[],
      });
      toast.success(
        `${approved} ${approved === 1 ? "ticket" : "tickets"} running in parallel`,
        { description: "Each agent opens a PR when its work lands." }
      );
    } catch (error) {
      toast.error("Could not start the run", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Connecting to Convex…</p>
      </div>
    );
  }

  if (isEmpty || !epicId) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold">No epics yet</h1>
        <p className="text-sm text-muted-foreground">
          Submit an epic and the PM agent breaks it into a ticket set you can
          approve. Everything after that runs here, live.
        </p>
        <div>
          <Button size="sm" onClick={() => router.push("/")}>
            <Sparkles data-icon="inline-start" />
            New epic
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-background">
      {/* Page chrome */}
      <header className="sticky top-0 z-20 flex h-11 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
        <span className="shrink-0 text-sm font-semibold tracking-tight">Cycles</span>
        <span className="text-muted-foreground/40">/</span>
        <span className="truncate text-sm text-muted-foreground">{epicTitle}</span>
        <Button size="sm" className="ml-auto" onClick={() => router.push("/")}>
          <Sparkles data-icon="inline-start" />
          New epic
        </Button>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-16 sm:px-8">
        {/* Title block */}
        <div className="pt-10 pb-6">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight">
              {epicTitle}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              One epic, four specialists, shipped in parallel. You hold the
              approval gate.
            </p>
          </div>

          {/* Epic meta — what this board is actually pointed at. */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            {/* The repo is created by the first run, so until then there is
                genuinely nothing to link to. */}
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <GitBranch className="size-3.5" />
              {epic?.repoUrl ? (
                <a
                  href={epic.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono hover:text-foreground hover:underline"
                >
                  {epic.repo}
                </a>
              ) : (
                <span className="font-mono text-muted-foreground/60">
                  repo created on first run
                </span>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              {presentTypes.map((type) => (
                <Tooltip key={type}>
                  <TooltipTrigger asChild>
                    <span>
                      <AgentTile
                        type={type}
                        running={tickets.some(
                          (t) => t.agentType === type && t.status === "running"
                        )}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {AGENTS[type].name} · {AGENTS[type].role}
                  </TooltipContent>
                </Tooltip>
              ))}
            </span>
            {runningCount > 0 && (
              <span className="font-mono text-amber-700">
                {runningCount} running
              </span>
            )}
          </div>
        </div>

        <Tabs defaultValue="all">
          {/* Tab bar + toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b pb-2">
            <TabsList variant="line" className="gap-1 p-0">
              <TabsTrigger
                value="all"
                className="h-7 rounded-full px-3 after:hidden data-active:bg-foreground! data-active:text-background!"
              >
                <Star />
                All tickets
              </TabsTrigger>
              <TabsTrigger
                value="status"
                className="h-7 rounded-full px-3 after:hidden data-active:bg-foreground! data-active:text-background!"
              >
                <CircleDot />
                By status
              </TabsTrigger>
              <TabsTrigger
                value="approval"
                className="h-7 rounded-full px-3 after:hidden data-active:bg-foreground! data-active:text-background!"
              >
                <UserCheck />
                Approval queue
                {proposedCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-sky-100 px-1.5 font-mono text-[10px] font-semibold text-sky-700">
                    {proposedCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="runs"
                className="h-7 rounded-full px-3 after:hidden data-active:bg-foreground! data-active:text-background!"
              >
                <ListChecks />
                Runs
              </TabsTrigger>
            </TabsList>

            <div className="ml-auto flex items-center gap-0.5">
              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Filter by agent"
                        className={cn(agentFilter.size > 0 && "text-foreground")}
                      >
                        <ListFilter />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Filter by agent</TooltipContent>
                </Tooltip>
                <PopoverContent align="end" className="w-56">
                  <p className="mb-2 text-xs font-medium">Show agents</p>
                  <div className="grid gap-2">
                    {presentTypes.map((type) => (
                      <label
                        key={type}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={agentFilter.size === 0 || agentFilter.has(type)}
                          onCheckedChange={() => toggleAgent(type)}
                        />
                        <AgentTile type={type} />
                        <span>{AGENTS[type].name}</span>
                      </label>
                    ))}
                  </div>
                  {agentFilter.size > 0 && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="mt-2 w-full"
                      onClick={() => setAgentFilter(new Set())}
                    >
                      Show all
                    </Button>
                  )}
                </PopoverContent>
              </Popover>

              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Sort">
                        <ArrowUpDown />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Sort</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={sortKey}
                    onValueChange={(value) => setSortKey(value as SortKey)}
                  >
                    {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                      <DropdownMenuRadioItem key={key} value={key}>
                        {SORT_LABELS[key]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Search tickets">
                        <Search />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Search tickets</TooltipContent>
                </Tooltip>
                <PopoverContent align="end" className="w-72">
                  <Label htmlFor="ticket-search" className="mb-2 text-xs">
                    Search tickets
                  </Label>
                  <Input
                    id="ticket-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Title, body, or FI-000"
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Display options">
                        <SlidersHorizontal />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Display options</TooltipContent>
                </Tooltip>
                <PopoverContent align="end" className="w-56">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={compact}
                      onCheckedChange={(checked) => setCompact(checked === true)}
                    />
                    Compact rows
                  </label>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Selection bar — the approval gate, reachable straight from the table. */}
          {selectedCount > 0 && (
            <div className="flex items-center gap-3 border-b bg-sky-50/60 px-3 py-2">
              <span className="text-xs font-medium">
                {selectedCount} selected
              </span>
              <Button
                size="xs"
                onClick={() =>
                  void approveAndRun(
                    [...selected].filter(
                      (id) =>
                        tickets.find((t) => t.id === id)?.status === "proposed"
                    )
                  )
                }
              >
                <Play data-icon="inline-start" />
                Approve &amp; run
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">
                Only proposed tickets start a run.
              </span>
            </div>
          )}

          <TabsContent
            value="all"
            className={cn(compact && "[&_td]:py-1 [&_td]:text-xs")}
          >
            <TicketTable
              tickets={visible}
              selected={selected}
              onToggle={toggleTicket}
              onToggleAll={toggleAll}
              onOpen={(ticket) => setPanelId(ticket.id)}
              epicId={epicId}
            />
          </TabsContent>

          <TabsContent value="status">
            <ByStatusView tickets={visible} onOpen={(ticket) => setPanelId(ticket.id)} />
          </TabsContent>

          <TabsContent value="approval">
            <ApprovalQueue
              tickets={visible}
              selected={selected}
              approvers={approvers}
              onToggle={toggleTicket}
              onToggleApprover={toggleApprover}
              onApproveAndRun={() =>
                void approveAndRun(
                  [...selected].filter(
                    (id) => tickets.find((t) => t.id === id)?.status === "proposed"
                  )
                )
              }
              onOpen={(ticket) => setPanelId(ticket.id)}
            />
          </TabsContent>

          <TabsContent value="runs">
            <RunsBoard
              tickets={visible}
              messages={messages}
              onOpen={(ticket) => setPanelId(ticket.id)}
            />
          </TabsContent>
        </Tabs>
      </main>

      <TicketPanel
        ticket={panelTicket}
        messages={messages}
        onOpenChange={(open) => !open && setPanelId(null)}
      />
    </div>
  );
}
