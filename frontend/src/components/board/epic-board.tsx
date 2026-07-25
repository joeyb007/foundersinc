"use client";

import {
  ArrowUpDown,
  CircleCheckBig,
  CircleDot,
  ChevronDown,
  Ellipsis,
  GitBranch,
  Link2,
  ListChecks,
  ListFilter,
  Lock,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  UserCheck,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  AGENTS,
  AGENT_TYPES,
  APPROVERS,
  EFFORT_ORDER,
  EPIC,
  PRIORITY_ORDER,
  TICKETS,
  type AgentType,
  type Ticket,
} from "@/lib/orchestrator";

import { ApprovalQueue, type Approver } from "./approval-queue";
import { ByStatusView } from "./by-status-view";
import { NewEpicDialog } from "./new-epic-dialog";
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

/** Tickets the planner would propose for a freshly submitted epic. */
function proposeTickets(text: string, seq: number): Ticket[] {
  const stub = text.length > 60 ? `${text.slice(0, 60).trimEnd()}…` : text;
  const plan: Array<{ title: string; body: string; agentType: AgentType }> = [
    {
      title: "Build the surface for this epic",
      body: `Frontend work for: ${stub}`,
      agentType: "ui",
    },
    {
      title: "Stand up the API and wire persistence",
      body: `Service layer for: ${stub}`,
      agentType: "swe",
    },
    {
      title: "Model the data this epic needs",
      body: `Schema and queries for: ${stub}`,
      agentType: "ds",
    },
  ];

  return plan.map((item, index) => ({
    id: `new_${seq}_${index}`,
    key: `FI-${200 + seq * 10 + index}`,
    epicId: EPIC.id,
    title: item.title,
    body: item.body,
    agentType: item.agentType,
    status: "proposed",
    priority: index === 0 ? "high" : "medium",
    effort: index === 1 ? "large" : "medium",
    updatedAt: new Date().toISOString(),
  }));
}

function ToolbarButton({
  label,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function EpicBoard() {
  const [tickets, setTickets] = useState<Ticket[]>(TICKETS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approvers, setApprovers] = useState<Approver[]>(APPROVERS);
  const [query, setQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState<Set<AgentType>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [compact, setCompact] = useState(false);
  // Track the id, not the object, so the panel follows its run as it advances.
  const [panelId, setPanelId] = useState<string | null>(null);
  const [epicOpen, setEpicOpen] = useState(false);
  const prCounter = useRef(43);
  const epicSeq = useRef(0);

  // Runs advance on their own — this is what makes the parallelism visible.
  useEffect(() => {
    const timer = setInterval(() => {
      setTickets((current) =>
        current.map((ticket) => {
          if (ticket.status !== "running") return ticket;
          const next = Math.min(100, (ticket.progress ?? 0) + 3);
          if (next < 100) {
            return { ...ticket, progress: next, updatedAt: new Date().toISOString() };
          }
          const prNumber = prCounter.current++;
          return {
            ...ticket,
            status: "done",
            progress: 100,
            prNumber,
            prUrl: `https://github.com/${EPIC.repo}/pull/${prNumber}`,
            updatedAt: new Date().toISOString(),
          };
        })
      );
    }, 2000);
    return () => clearInterval(timer);
  }, []);

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

  /** The gate: approved tickets start running together, not one at a time. */
  function approveAndRun(ids: string[]) {
    if (ids.length === 0) return;
    setTickets((current) =>
      current.map((ticket) =>
        ids.includes(ticket.id) && ticket.status === "proposed"
          ? {
              ...ticket,
              status: "running",
              progress: 0,
              updatedAt: new Date().toISOString(),
            }
          : ticket
      )
    );
    setSelected(new Set());
    toast.success(
      `${ids.length} ${ids.length === 1 ? "ticket" : "tickets"} running in parallel`,
      { description: "Each agent opens a PR when its work lands." }
    );
  }

  function runAllApproved() {
    const ids = tickets.filter((t) => t.status === "approved").map((t) => t.id);
    if (ids.length === 0) {
      toast.info("Nothing approved yet", {
        description: "Approve tickets in the approval queue first.",
      });
      return;
    }
    setTickets((current) =>
      current.map((ticket) =>
        ids.includes(ticket.id)
          ? {
              ...ticket,
              status: "running",
              progress: 0,
              updatedAt: new Date().toISOString(),
            }
          : ticket
      )
    );
    toast.success(`Started ${ids.length} approved ${ids.length === 1 ? "ticket" : "tickets"}`);
  }

  function submitEpic(text: string) {
    epicSeq.current += 1;
    const proposed = proposeTickets(text, epicSeq.current);
    setTickets((current) => [...proposed, ...current]);
    toast.success(`Decomposed into ${proposed.length} tickets`, {
      description: "Review them in the approval queue.",
    });
  }

  return (
    <div className="flex min-h-full flex-col bg-background">
      {/* Page chrome */}
      <header className="sticky top-0 z-20 flex h-11 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
        <CircleCheckBig className="size-4 shrink-0 text-emerald-600" />
        <span className="truncate text-sm font-medium">{EPIC.title}</span>
        <Separator orientation="vertical" className="h-4" />
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Lock className="size-3" />
          Private
          <ChevronDown className="size-3" />
        </span>

        <div className="ml-auto flex items-center gap-1">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Edited 1h ago
          </span>
          <Button variant="ghost" size="sm">
            <Lock data-icon="inline-start" />
            Share
          </Button>
          <ToolbarButton label="Copy link">
            <Link2 />
          </ToolbarButton>
          <ToolbarButton label="Favorite">
            <Star />
          </ToolbarButton>
          <ToolbarButton label="More">
            <Ellipsis />
          </ToolbarButton>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-16 sm:px-8">
        {/* Title block */}
        <div className="pt-10 pb-6">
          <div className="flex items-start gap-3">
            <CircleCheckBig className="mt-1 size-8 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-tight">
                {EPIC.title}
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                One epic, four specialists, shipped in parallel. You hold the
                approval gate.
              </p>
            </div>
          </div>

          {/* Epic meta — what this board is actually pointed at. */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 pl-11 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <GitBranch className="size-3.5" />
              <span className="font-mono">{EPIC.repo}</span>
            </span>
            <span className="flex items-center gap-1.5">
              {AGENT_TYPES.map((type) => (
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
                    {AGENT_TYPES.map((type) => (
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

              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Automations">
                        <Zap />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Automations</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Automations</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={runAllApproved}>
                    <Play />
                    Run every approved ticket
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setEpicOpen(true)}>
                    <Sparkles />
                    Decompose a new epic
                  </DropdownMenuItem>
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

              <div className="ml-1 flex items-center">
                <Button
                  size="sm"
                  className="rounded-r-none"
                  onClick={() => setEpicOpen(true)}
                >
                  <Plus data-icon="inline-start" />
                  New
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon-sm"
                      className="rounded-l-none border-l border-l-primary-foreground/20"
                      aria-label="More new-item options"
                    >
                      <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEpicOpen(true)}>
                      <Sparkles />
                      New epic
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setEpicOpen(true)}>
                      <Plus />
                      New ticket
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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
                  approveAndRun(
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
              onNewTicket={() => setEpicOpen(true)}
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
                approveAndRun(
                  [...selected].filter(
                    (id) => tickets.find((t) => t.id === id)?.status === "proposed"
                  )
                )
              }
              onOpen={(ticket) => setPanelId(ticket.id)}
            />
          </TabsContent>

          <TabsContent value="runs">
            <RunsBoard tickets={visible} onOpen={(ticket) => setPanelId(ticket.id)} />
          </TabsContent>
        </Tabs>
      </main>

      <TicketPanel
        ticket={panelTicket}
        onOpenChange={(open) => !open && setPanelId(null)}
      />
      <NewEpicDialog
        open={epicOpen}
        onOpenChange={setEpicOpen}
        onSubmit={submitEpic}
      />
    </div>
  );
}
