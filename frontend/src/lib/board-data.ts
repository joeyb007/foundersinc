"use client";

// The single seam between Convex and the board UI. Everything the screens
// render is derived here from live `useQuery` subscriptions — no polling, no
// local simulation. Components keep speaking the `Ticket`/`Message` view model
// in `orchestrator.ts`; this file is the only place that knows about Convex
// documents.

import { useQuery } from "convex/react";
import { useMemo } from "react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  type AgentType,
  type Effort,
  type Epic,
  type Message,
  type Priority,
  type Ticket,
  type TicketStatus,
} from "./orchestrator";

// ---------------------------------------------------------------------------
// Derived fields
//
// The schema is locked (docs/ctd.md), so ticket key, priority and effort are
// *presentation*, derived deterministically from data Convex does hold rather
// than stored as extra columns.
// ---------------------------------------------------------------------------

function priorityFor(index: number, total: number): Priority {
  if (index < Math.max(1, Math.round(total * 0.3))) return "high";
  if (index < Math.max(2, Math.round(total * 0.75))) return "medium";
  return "low";
}

function effortFor(body: string): Effort {
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words < 25) return "small";
  if (words < 90) return "medium";
  return "large";
}

/** `gh pr create` prints the PR URL; the number is its last path segment. */
function prNumberFrom(prUrl: string | undefined): number | undefined {
  if (!prUrl) return undefined;
  const match = /\/pull\/(\d+)/.exec(prUrl);
  return match ? Number(match[1]) : undefined;
}

// Agents run inside a throwaway clone at /tmp/agent-<type>-<hex>/, so raw tool
// logs carry that prefix. Strip it to leave the repo-relative path a reader
// actually recognises.
const WORKDIR_PREFIX = /^.*?agent-[a-z]+-[0-9a-f]{6,}\//;
const FILE_IN_LOG = /(?:file_path|path)='([^']+)'/g;

function filesTouchedFrom(messages: Doc<"messages">[]): string[] {
  const files = new Set<string>();
  for (const m of messages) {
    if (m.role !== "agent") continue;
    for (const match of m.content.matchAll(FILE_IN_LOG)) {
      files.add(match[1].replace(WORKDIR_PREFIX, ""));
    }
  }
  return [...files];
}

function timeOf(creationTime: number) {
  return new Date(creationTime).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export function toMessage(doc: Doc<"messages">): Message {
  return {
    id: doc._id,
    ticketId: doc.ticketId,
    role: doc.role,
    content: doc.content,
    at: timeOf(doc._creationTime),
  };
}

/** `https://github.com/owner/name.git` → `owner/name`. */
function repoSlug(repoUrl: string | undefined): string | null {
  if (!repoUrl) return null;
  const match = /github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/.exec(repoUrl);
  return match ? match[1] : repoUrl;
}

export function toEpic(doc: Doc<"epics">): Epic {
  return {
    id: doc._id,
    title: doc.title,
    body: doc.body,
    status: doc.status,
    // Created lazily by the first run, so it's null on a freshly decomposed epic.
    repo: repoSlug(doc.repoUrl),
    repoUrl: doc.repoUrl ?? null,
  };
}

/** Ticket keys are positional (FI-101, FI-102, …), so callers must pass the
 *  whole set in creation order — mapping a single ticket in isolation would
 *  give it a key that contradicts the board. */
export function toTickets(
  ticketDocs: Doc<"tickets">[],
  runDocs: Doc<"runs">[],
  messageDocs: Doc<"messages">[],
): Ticket[] {
  const ordered = [...ticketDocs].sort((a, b) => a._creationTime - b._creationTime);

  // A ticket bounced back to `review` and re-run has more than one run; the
  // newest is the one carrying the current PR or diff.
  const latestRun = new Map<string, Doc<"runs">>();
  for (const run of runDocs) {
    const existing = latestRun.get(run.ticketId);
    if (!existing || run._creationTime > existing._creationTime) {
      latestRun.set(run.ticketId, run);
    }
  }

  const byTicket = new Map<string, Doc<"messages">[]>();
  for (const m of messageDocs) {
    const list = byTicket.get(m.ticketId);
    if (list) list.push(m);
    else byTicket.set(m.ticketId, [m]);
  }

  return ordered.map((doc, index) => {
    const run = latestRun.get(doc._id);
    const messages = byTicket.get(doc._id) ?? [];
    const files = filesTouchedFrom(messages);

    // "Updated" means the last thing that actually happened to this ticket,
    // which is usually its newest log line rather than its creation.
    const lastTouch = Math.max(
      doc._creationTime,
      run?._creationTime ?? 0,
      ...messages.map((m) => m._creationTime),
    );

    return {
      id: doc._id,
      key: `FI-${101 + index}`,
      epicId: doc.epicId,
      title: doc.title,
      body: doc.body,
      agentType: doc.agentType as AgentType,
      status: doc.status as TicketStatus,
      priority: priorityFor(index, ordered.length),
      effort: effortFor(doc.body),
      updatedAt: new Date(lastTouch).toISOString(),
      steps: messages.length,
      prUrl: run?.prUrl,
      prNumber: prNumberFrom(run?.prUrl),
      diff: run?.diff,
      filesTouched: files.length > 0 ? files : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export type EpicBoardData = {
  epic: Epic | null;
  epicId: Id<"epics"> | null;
  tickets: Ticket[];
  messages: Message[];
  /** True until the first server response lands. Distinguishes "still loading"
   *  from the genuinely empty board, which need different empty states. */
  isLoading: boolean;
  /** No epics exist at all — the user has never submitted one. */
  isEmpty: boolean;
};

/** Subscribes to one epic and everything under it. `rawEpicId` is the raw
 *  `?epicId=` string; an unknown or malformed one resolves to the most recent
 *  epic rather than erroring. */
export function useEpicBoard(rawEpicId?: string | null): EpicBoardData {
  const epicDoc = useQuery(api.epics.resolve, { epicId: rawEpicId ?? undefined });
  const epicId = epicDoc?._id ?? null;
  const scoped = epicId ? { epicId } : "skip";

  const ticketDocs = useQuery(api.tickets.listByEpic, scoped);
  const runDocs = useQuery(api.runs.listByEpic, scoped);
  const messageDocs = useQuery(api.messages.listByEpic, scoped);

  const tickets = useMemo(
    () => toTickets(ticketDocs ?? [], runDocs ?? [], messageDocs ?? []),
    [ticketDocs, runDocs, messageDocs],
  );
  const messages = useMemo(
    () => (messageDocs ?? []).map(toMessage),
    [messageDocs],
  );

  return {
    epic: epicDoc ? toEpic(epicDoc) : null,
    epicId,
    tickets,
    messages,
    isLoading:
      epicDoc === undefined ||
      (epicId !== null &&
        (ticketDocs === undefined || runDocs === undefined || messageDocs === undefined)),
    isEmpty: epicDoc === null,
  };
}

/** The intake screen watches the tickets the PM agent is writing as they land,
 *  which is a strict subset of the board's subscription. */
export function useProposedTickets(epicId: Id<"epics"> | null): Ticket[] {
  const scoped = epicId ? { epicId } : "skip";
  const ticketDocs = useQuery(api.tickets.listByEpic, scoped);
  return useMemo(() => toTickets(ticketDocs ?? [], [], []), [ticketDocs]);
}
