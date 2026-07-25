"use client";

import { ArrowRight, ArrowLeft, RotateCcw, Sparkles, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AGENTS, AGENT_TYPES, type Ticket } from "@/lib/orchestrator";
import { formatBytes, type Decomposition, type SourceDoc } from "@/lib/intake";

import { AgentTile } from "../board/tokens";
import { AgentProgress } from "./agent-progress";
import { ManualComposer } from "./manual-composer";

export type IntakePhase =
  | "empty"
  | "previewing"
  | "delegating"
  | "manual"
  | "drafted";

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <p className="font-mono text-[10px] font-medium tracking-wider text-muted-foreground/70 uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

function SourceCard({ doc }: { doc: SourceDoc }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <p className="truncate font-mono text-xs text-foreground">{doc.name}</p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
        {formatBytes(doc.bytes)}
      </p>
    </div>
  );
}

function Specialists() {
  return (
    <div className="grid gap-1.5">
      {AGENT_TYPES.map((type) => (
        <div key={type} className="flex items-center gap-2">
          <AgentTile type={type} />
          <span className="text-xs font-medium">{AGENTS[type].name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {AGENTS[type].role}
          </span>
        </div>
      ))}
    </div>
  );
}

export function IntakeRail({
  phase,
  doc,
  result,
  origin,
  manualTickets,
  steps,
  completed,
  onDelegate,
  onManual,
  onManualChange,
  onManualDone,
  onBack,
  onRerun,
  onReplace,
  onCommit,
}: {
  phase: IntakePhase;
  doc: SourceDoc | null;
  result: Decomposition | null;
  origin: "agent" | "manual";
  manualTickets: Ticket[];
  steps: string[];
  completed: number;
  onDelegate: () => void;
  onManual: () => void;
  onManualChange: (tickets: Ticket[]) => void;
  onManualDone: () => void;
  onBack: () => void;
  onRerun: () => void;
  onReplace: () => void;
  onCommit: () => void;
}) {
  return (
    <aside className="flex w-[19rem] shrink-0 flex-col overflow-y-auto border-l bg-background">
      <div className="grid gap-5 p-4">
        {phase === "empty" && (
          <>
            <Section label="Start here">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Upload the epic document or project spec you want built. It stays
                on the left while you decide how to break it down.
              </p>
            </Section>
            <Separator />
            <Section label="Available specialists">
              <Specialists />
            </Section>
          </>
        )}

        {doc && phase !== "empty" && (
          <Section label="Source">
            <SourceCard doc={doc} />
          </Section>
        )}

        {phase === "previewing" && result === null && doc && (
          <>
            <Section label="Break it down">
              <p className="text-xs leading-relaxed text-muted-foreground">
                The PM agent reads the document, drafts a ticket per unit of
                work, and routes each one to a specialist.
              </p>
            </Section>

            <div className="grid gap-2">
              <Button onClick={onDelegate}>
                <Sparkles data-icon="inline-start" />
                Hand to the PM agent
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button variant="outline" size="sm" onClick={onManual}>
                Configure manually
              </Button>
            </div>

            <Separator />
            <Button variant="ghost" size="sm" onClick={onReplace}>
              <Upload data-icon="inline-start" />
              Replace document
            </Button>
          </>
        )}

        {phase === "delegating" && (
          <AgentProgress steps={steps} completed={completed} />
        )}

        {phase === "manual" && (
          <>
            <ManualComposer tickets={manualTickets} onChange={onManualChange} />
            <div className="grid gap-2">
              <Button onClick={onManualDone} disabled={manualTickets.length === 0}>
                Go to preview
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft data-icon="inline-start" />
                Back to the document
              </Button>
            </div>
          </>
        )}

        {phase === "drafted" && result && (
          <>
            <Section label="Proposed breakdown">
              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="text-2xl font-semibold tracking-tight">
                  {result.tickets.length}
                </p>
                <p className="text-xs text-muted-foreground">
                  {result.tickets.length === 1 ? "ticket" : "tickets"} proposed
                </p>

                <div className="mt-3 grid gap-1.5 border-t pt-3">
                  {AGENT_TYPES.map((type) => {
                    const count = result.tickets.filter(
                      (t) => t.agentType === type
                    ).length;
                    if (count === 0) return null;
                    return (
                      <div key={type} className="flex items-center gap-2">
                        <AgentTile type={type} />
                        <span className="text-xs">{AGENTS[type].name}</span>
                        <span className="ml-auto font-mono text-xs text-muted-foreground">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                All {result.tickets.length} start together once you approve them
                — that is the parallelism.
              </p>
            </Section>

            <div className="grid gap-2">
              <Button onClick={onCommit}>
                Open full board
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onRerun}>
                <RotateCcw data-icon="inline-start" />
                {origin === "agent" ? "Re-run the agent" : "Edit the ticket set"}
              </Button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
