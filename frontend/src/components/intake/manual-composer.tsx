"use client";

import { Plus, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AGENTS,
  AGENT_TYPES,
  type AgentType,
  type Effort,
  type Priority,
  type Ticket,
} from "@/lib/orchestrator";
import { blankTicket } from "@/lib/intake";

import { AgentTile } from "../board/tokens";

const PRIORITIES: Priority[] = ["high", "medium", "low"];
const EFFORTS: Effort[] = ["small", "medium", "large"];

/** The manual path: the human is the planner, so the agent never runs. Tickets
 *  land in the same shape the PM agent would have produced, which is what lets
 *  the preview table and the board handoff stay identical across both paths. */
export function ManualComposer({
  tickets,
  onChange,
}: {
  tickets: Ticket[];
  onChange: (tickets: Ticket[]) => void;
}) {
  const [title, setTitle] = useState("");
  const [agentType, setAgentType] = useState<AgentType>("ui");
  const [priority, setPriority] = useState<Priority>("medium");
  const [effort, setEffort] = useState<Effort>("medium");
  // Monotonic, not `tickets.length` — removing a ticket and adding another
  // would otherwise mint the id and FI- key that was just freed.
  const nextIndex = useRef(0);

  function add() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const base = blankTicket(nextIndex.current++);
    onChange([
      ...tickets,
      { ...base, title: trimmed, agentType, priority, effort },
    ]);
    setTitle("");
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs font-medium">Build the set yourself</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Each ticket needs a title and a specialist. The agent stays out of it.
        </p>
      </div>

      <div className="grid gap-2.5 rounded-xl border bg-muted/30 p-3">
        <div className="grid gap-1.5">
          <Label htmlFor="manual-title" className="text-xs">
            Title
          </Label>
          <Input
            id="manual-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            placeholder="Message thread view"
            className="h-8 text-sm"
          />
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs">Specialist</Label>
          <Select
            value={agentType}
            onValueChange={(value) => setAgentType(value as AgentType)}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  <AgentTile type={type} />
                  {AGENTS[type].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">Priority</Label>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as Priority)}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((value) => (
                  <SelectItem key={value} value={value} className="capitalize">
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Effort</Label>
            <Select
              value={effort}
              onValueChange={(value) => setEffort(value as Effort)}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EFFORTS.map((value) => (
                  <SelectItem key={value} value={value} className="capitalize">
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button size="sm" variant="outline" onClick={add} disabled={!title.trim()}>
          <Plus data-icon="inline-start" />
          Add ticket
        </Button>
      </div>

      {tickets.length > 0 && (
        <div className="grid gap-1">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-muted/60"
            >
              <AgentTile type={ticket.agentType} />
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                {ticket.title}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${ticket.title}`}
                className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => onChange(tickets.filter((t) => t.id !== ticket.id))}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
