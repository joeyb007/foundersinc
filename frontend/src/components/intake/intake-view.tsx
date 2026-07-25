"use client";

import { CircleCheckBig, LayoutList } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { EPIC, type Ticket } from "@/lib/orchestrator";
import {
  buildDecomposition,
  decompositionSteps,
  docSummary,
  docTitle,
  stashDraft,
  type Decomposition,
  type SourceDoc,
} from "@/lib/intake";

import { BreakdownTable } from "./breakdown-table";
import { DocDropzone } from "./doc-dropzone";
import { DocPreview } from "./doc-preview";
import { IntakeRail, type IntakePhase } from "./intake-rail";

type LeftTab = "document" | "breakdown";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function IntakeView() {
  const router = useRouter();
  const [phase, setPhase] = useState<IntakePhase>("empty");
  const [doc, setDoc] = useState<SourceDoc | null>(null);
  const [result, setResult] = useState<Decomposition | null>(null);
  const [origin, setOrigin] = useState<"agent" | "manual">("agent");
  const [manualTickets, setManualTickets] = useState<Ticket[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [completed, setCompleted] = useState(0);
  const [leftTab, setLeftTab] = useState<LeftTab>("document");

  // A run in flight has to stop if the user resets or leaves mid-decomposition,
  // otherwise its timers land on a phase that has already moved on.
  const runToken = useRef(0);
  useEffect(() => () => void (runToken.current += 1), []);

  function acceptDoc(next: SourceDoc) {
    runToken.current += 1;
    setDoc(next);
    setResult(null);
    setManualTickets([]);
    setLeftTab("document");
    setPhase("previewing");
  }

  async function delegate() {
    if (!doc) return;
    const token = ++runToken.current;
    const drafted = buildDecomposition(doc);
    const plan = decompositionSteps(drafted);

    setOrigin("agent");
    setSteps(plan.map((step) => step.label));
    setCompleted(0);
    setPhase("delegating");

    for (let index = 0; index < plan.length; index++) {
      await wait(plan[index].ms);
      if (runToken.current !== token) return;
      setCompleted(index + 1);
    }

    await wait(250);
    if (runToken.current !== token) return;

    setResult(drafted);
    setLeftTab("breakdown");
    setPhase("drafted");
  }

  function finishManual() {
    if (!doc || manualTickets.length === 0) return;
    setOrigin("manual");
    setResult({
      title: docTitle(doc.text),
      body: docSummary(doc.text),
      repo: EPIC.repo,
      tickets: manualTickets,
      stats: { words: 0, sections: 0, requirements: 0 },
    });
    setLeftTab("breakdown");
    setPhase("drafted");
  }

  function rerun() {
    runToken.current += 1;
    setResult(null);
    setLeftTab("document");
    setPhase(origin === "manual" ? "manual" : "previewing");
  }

  function replaceDoc() {
    runToken.current += 1;
    setDoc(null);
    setResult(null);
    setManualTickets([]);
    setLeftTab("document");
    setPhase("empty");
  }

  function commit() {
    if (!doc || !result) return;
    stashDraft({
      title: result.title,
      body: result.body,
      repo: result.repo,
      source: doc.name,
      tickets: result.tickets,
    });
    toast.success(
      `${result.tickets.length} ${
        result.tickets.length === 1 ? "ticket" : "tickets"
      } added to the board`,
      { description: "Approve the set to start the run." }
    );
    router.push("/board");
  }

  const showTabs = phase === "drafted" && result !== null;

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <CircleCheckBig className="size-4 shrink-0 text-emerald-600" />
        <span className="text-sm font-medium">New epic</span>
        <Separator orientation="vertical" className="h-4" />
        <span className="truncate text-xs text-muted-foreground">
          {doc ? docTitle(doc.text) : "Upload a spec to get started"}
        </span>
        {/* This is the landing screen, so the escape hatch is "go look at the
            existing board", not "dismiss" — an × would read as the latter. */}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => router.push("/board")}
        >
          <LayoutList data-icon="inline-start" />
          Epic board
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          {showTabs && (
            <div className="flex shrink-0 items-center gap-1 border-b px-3 py-1.5">
              {(["document", "breakdown"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setLeftTab(tab)}
                  className={cn(
                    "h-7 rounded-full px-3 text-sm font-medium capitalize transition-colors",
                    leftTab === tab
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {tab}
                  {tab === "breakdown" && result && (
                    <span className="ml-1.5 font-mono text-[11px] opacity-70">
                      {result.tickets.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1">
            {!doc ? (
              <DocDropzone onDoc={acceptDoc} />
            ) : showTabs && leftTab === "breakdown" && result ? (
              <BreakdownTable tickets={result.tickets} />
            ) : (
              <DocPreview doc={doc} />
            )}
          </div>
        </section>

        <IntakeRail
          phase={phase}
          doc={doc}
          result={result}
          origin={origin}
          manualTickets={manualTickets}
          steps={steps}
          completed={completed}
          onDelegate={() => void delegate()}
          onManual={() => setPhase("manual")}
          onManualChange={setManualTickets}
          onManualDone={finishManual}
          onBack={() => setPhase("previewing")}
          onRerun={rerun}
          onReplace={replaceDoc}
          onCommit={commit}
        />
      </div>
    </div>
  );
}
