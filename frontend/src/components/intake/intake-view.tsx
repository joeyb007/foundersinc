"use client";

import { useAction, useMutation } from "convex/react";
import { CircleCheckBig, LayoutList } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useProposedTickets } from "@/lib/board-data";
import { type Ticket } from "@/lib/orchestrator";
import {
  docStats,
  docSummary,
  docTitle,
  type Decomposition,
  type SourceDoc,
} from "@/lib/intake";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { BreakdownTable } from "./breakdown-table";
import { DocDropzone } from "./doc-dropzone";
import { DocPreview } from "./doc-preview";
import { IntakeRail, type IntakePhase } from "./intake-rail";

type LeftTab = "document" | "breakdown";

// The two things that actually happen when you hand a spec to the PM agent.
// Both complete on a real await, not a timer.
const PM_STEPS = ["Submitted the epic", "PM agent decomposing the spec"];

export function IntakeView() {
  const router = useRouter();
  const submitEpic = useMutation(api.orchestrator.submitEpic);
  const proposeDecomposition = useAction(api.orchestrator.proposeDecomposition);
  const addTickets = useMutation(api.orchestrator.addTickets);
  const ensureEpicRepo = useAction(api.orchestrator.ensureEpicRepo);

  const [phase, setPhase] = useState<IntakePhase>("empty");
  const [doc, setDoc] = useState<SourceDoc | null>(null);
  const [epicId, setEpicId] = useState<Id<"epics"> | null>(null);
  const [origin, setOrigin] = useState<"agent" | "manual">("agent");
  const [manualTickets, setManualTickets] = useState<Ticket[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [completed, setCompleted] = useState(0);
  const [leftTab, setLeftTab] = useState<LeftTab>("document");
  const [opening, setOpening] = useState(false);

  // What the PM agent actually wrote, streamed back as it lands rather than
  // guessed at locally.
  const proposed = useProposedTickets(epicId);

  // A run in flight has to stop if the user resets or leaves mid-decomposition,
  // otherwise its resolution lands on a phase that has already moved on.
  const runToken = useRef(0);
  useEffect(() => () => void (runToken.current += 1), []);

  const result: Decomposition | null = useMemo(() => {
    if (phase !== "drafted" || !doc) return null;
    const tickets = origin === "manual" ? manualTickets : proposed;
    if (tickets.length === 0) return null;
    return {
      title: docTitle(doc.text),
      body: docSummary(doc.text),
      tickets,
      stats: docStats(doc.text),
    };
  }, [phase, doc, origin, manualTickets, proposed]);

  function acceptDoc(next: SourceDoc) {
    runToken.current += 1;
    setDoc(next);
    setEpicId(null);
    setManualTickets([]);
    setLeftTab("document");
    setPhase("previewing");
  }

  async function delegate() {
    if (!doc) return;
    const token = ++runToken.current;

    setOrigin("agent");
    setSteps(PM_STEPS);
    setCompleted(0);
    setPhase("delegating");

    try {
      const id = await submitEpic({ title: docTitle(doc.text), body: doc.text });
      if (runToken.current !== token) return;
      setCompleted(1);

      const outcome = await proposeDecomposition({ epicId: id });
      if (runToken.current !== token) return;
      setCompleted(2);

      setEpicId(id);
      setLeftTab("breakdown");
      setPhase("drafted");

      if (outcome.usedFallback) {
        toast.warning("PM agent unreachable", {
          description:
            "Used the built-in fallback ticket set. Check AGENT_SERVICE_URL on the Convex deployment.",
        });
      }
    } catch (error) {
      if (runToken.current !== token) return;
      setPhase("previewing");
      toast.error("Decomposition failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function finishManual() {
    if (!doc || manualTickets.length === 0) return;
    const token = ++runToken.current;

    try {
      const id = await submitEpic({ title: docTitle(doc.text), body: doc.text });
      await addTickets({
        epicId: id,
        tickets: manualTickets.map((t) => ({
          title: t.title,
          // A hand-written ticket often has only a title; the agent still needs
          // something to act on, so the title doubles as the body.
          body: t.body.trim() || t.title,
          agentType: t.agentType,
        })),
      });
      if (runToken.current !== token) return;

      setEpicId(id);
      setOrigin("manual");
      setLeftTab("breakdown");
      setPhase("drafted");
    } catch (error) {
      if (runToken.current !== token) return;
      toast.error("Could not save the ticket set", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Starting over mints a fresh epic rather than rewriting the old one — the
   *  previous attempt is already committed to Convex, and editing it in place
   *  would mean reconciling tickets an agent may already be running. */
  function rerun() {
    runToken.current += 1;
    setEpicId(null);
    setLeftTab("document");
    setPhase(origin === "manual" ? "manual" : "previewing");
  }

  function replaceDoc() {
    runToken.current += 1;
    setDoc(null);
    setEpicId(null);
    setManualTickets([]);
    setLeftTab("document");
    setPhase("empty");
  }

  /** Create the epic's repo on the way to the board, so the link is already
   *  there when it renders instead of appearing only after the first run.
   *
   *  A failure here is not a reason to trap the user on this screen: the board
   *  handles a repo-less epic, and the run workflow retries the creation before
   *  it fans out. So warn and navigate anyway. */
  async function commit() {
    if (!epicId || opening) return;
    setOpening(true);
    try {
      const repoUrl = await ensureEpicRepo({ epicId });
      if (!repoUrl) {
        toast.warning("Could not create the repo yet", {
          description: "The board will open; it retries when you start the run.",
        });
      }
    } catch (error) {
      toast.warning("Could not create the repo yet", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setOpening(false);
    }
    router.push(`/board?epicId=${epicId}`);
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
          onManualDone={() => void finishManual()}
          onBack={() => setPhase("previewing")}
          onRerun={rerun}
          onReplace={replaceDoc}
          onCommit={() => void commit()}
          opening={opening}
        />
      </div>
    </div>
  );
}
