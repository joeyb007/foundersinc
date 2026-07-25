// Epic intake: turning an uploaded spec document into a proposed ticket set.
//
// Everything here is deterministic and offline. docs/ctd.md asks both sides to
// build against seeded data, so `buildDecomposition` stands in for the PM agent
// the backend will eventually expose. When the real `decomposeEpic` action
// lands, that one function body becomes a fetch — nothing else in the intake UI
// has to change.

import {
  AGENT_TYPES,
  EPIC,
  type AgentType,
  type Effort,
  type Priority,
  type Ticket,
} from "./orchestrator";

export type SourceDoc = {
  /** File name, or "Pasted spec" when the text was typed rather than uploaded. */
  name: string;
  text: string;
  bytes: number;
};

export type DocStats = {
  words: number;
  sections: number;
  requirements: number;
};

export type Decomposition = {
  title: string;
  body: string;
  repo: string;
  tickets: Ticket[];
  stats: DocStats;
};

// ---------------------------------------------------------------------------
// Reading a file
// ---------------------------------------------------------------------------

export const ACCEPTED_EXTENSIONS = [".md", ".markdown", ".txt"] as const;
export const ACCEPT_ATTRIBUTE = ".md,.markdown,.txt,text/markdown,text/plain";
export const MAX_DOC_BYTES = 1_000_000;

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hasAcceptedExtension(name: string) {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Reads a dropped or picked file, rejecting with a message meant for a toast.
 *  Extension is the gate rather than MIME type — browsers report `.md` as
 *  everything from text/markdown to empty string depending on the OS. */
export function readDocFile(file: File): Promise<SourceDoc> {
  if (!hasAcceptedExtension(file.name)) {
    return Promise.reject(
      new Error(
        `${file.name} isn't a supported format. Drop a .md, .markdown, or .txt file.`
      )
    );
  }
  if (file.size > MAX_DOC_BYTES) {
    return Promise.reject(
      new Error(
        `${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(
          MAX_DOC_BYTES
        )}.`
      )
    );
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error(`Could not read ${file.name}. Try uploading it again.`));
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      if (!text.trim()) {
        reject(new Error(`${file.name} is empty. There is nothing to break down.`));
        return;
      }
      resolve({ name: file.name, text, bytes: file.size });
    };
    reader.readAsText(file);
  });
}

// ---------------------------------------------------------------------------
// Reading the document's shape
// ---------------------------------------------------------------------------

export type DocSection = { heading: string; body: string };

/** Splits on `##` headings. Prose before the first one is the epic summary, not
 *  a section — it describes the whole epic rather than a unit of work. */
export function splitSections(text: string): DocSection[] {
  const lines = text.split(/\r?\n/);
  const sections: DocSection[] = [];
  let current: DocSection | null = null;

  for (const line of lines) {
    const heading = /^#{2,3}\s+(.*\S)\s*$/.exec(line);
    if (heading) {
      if (current) sections.push(current);
      current = { heading: heading[1], body: "" };
      continue;
    }
    if (current) current.body += `${line}\n`;
  }
  if (current) sections.push(current);

  return sections
    .map((s) => ({ heading: s.heading, body: s.body.trim() }))
    .filter((s) => s.heading.length > 0);
}

export function docTitle(text: string) {
  const h1 = /^#\s+(.*\S)\s*$/m.exec(text);
  if (h1) return h1[1];
  const firstLine = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^#+\s*/, "").trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "Untitled epic";
  return firstLine.length > 80 ? `${firstLine.slice(0, 80).trimEnd()}…` : firstLine;
}

/** The prose between the title and the first section — what the epic is for. */
export function docSummary(text: string) {
  const withoutTitle = text.replace(/^#\s+.*$/m, "");
  const beforeFirstSection = withoutTitle.split(/^#{2,3}\s+/m)[0];
  const prose = beforeFirstSection
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*+]\s+/, "").trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .trim();
  if (!prose) return docTitle(text);
  return prose.length > 400 ? `${prose.slice(0, 400).trimEnd()}…` : prose;
}

export function docStats(text: string): DocStats {
  const words = text.split(/\s+/).filter(Boolean).length;
  const sections = splitSections(text).length;
  const requirements = text
    .split(/\r?\n/)
    .filter((line) => /^\s*(?:[-*+]|\d+\.)\s+\S/.test(line)).length;
  return { words, sections, requirements };
}

// ---------------------------------------------------------------------------
// Routing work to a specialist
// ---------------------------------------------------------------------------

// The orchestrator selects among four fixed agents; it does not invent
// capabilities (hard scope rule in docs/ctd.md). This is that selection, done
// on vocabulary rather than a model call.
const AGENT_KEYWORDS: Record<AgentType, string[]> = {
  ui: [
    "ui", "screen", "view", "component", "page", "button", "layout", "design",
    "frontend", "css", "render", "composer", "indicator", "badge", "form",
    "modal", "navigation", "responsive", "animation", "accessib",
  ],
  swe: [
    "api", "endpoint", "service", "server", "backend", "auth", "gateway",
    "websocket", "socket", "deploy", "infra", "cache", "queue", "route",
    "integration", "webhook", "rate limit", "reconnect", "session",
  ],
  ds: [
    "data", "schema", "database", "query", "table", "migration", "store",
    "index", "analytics", "pipeline", "retention", "archive", "metric",
    "report", "aggregate", "presence", "warehouse",
  ],
  ml: [
    "model", "ml", "predict", "classif", "embedding", "score", "recommend",
    "nlp", "train", "inference", "toxicity", "sentiment", "suggest", "rank",
    "moderation", "summariz",
  ],
};

/** Falls back to round-robin rather than a fixed default, so an unusually
 *  worded doc still shows all four specialists rather than a wall of one. */
export function classify(text: string, index: number): AgentType {
  const haystack = text.toLowerCase();
  let best: AgentType | null = null;
  let bestScore = 0;

  for (const type of AGENT_TYPES) {
    const score = AGENT_KEYWORDS[type].reduce(
      (total, word) => (haystack.includes(word) ? total + 1 : total),
      0
    );
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }

  return best ?? AGENT_TYPES[index % AGENT_TYPES.length];
}

function effortFor(body: string): Effort {
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words < 25) return "small";
  if (words < 90) return "medium";
  return "large";
}

function priorityFor(index: number, total: number): Priority {
  if (index < Math.max(1, Math.round(total * 0.3))) return "high";
  if (index < Math.max(2, Math.round(total * 0.75))) return "medium";
  return "low";
}

/** Ticket bodies render as plain text on the board, so Markdown syntax that
 *  survives the copy would show up as literal punctuation. */
function summarize(body: string, fallback: string) {
  const prose = body
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^[-*+]\s+/, "")
        .replace(/^#+\s*/, "")
        .replace(/`([^`]+)`/g, "$1")
        .trim()
    )
    .filter(Boolean)
    .join(" ");
  const text = prose || fallback;
  return text.length > 180 ? `${text.slice(0, 180).trimEnd()}…` : text;
}

// ---------------------------------------------------------------------------
// The decomposition itself
// ---------------------------------------------------------------------------

/** Docs without `##` sections still have to produce a sensible ticket set, so
 *  they fall back to the shape every epic needs: surface, service, data. */
function fallbackUnits(text: string): DocSection[] {
  const stub = docSummary(text);
  return [
    { heading: "Build the surface for this epic", body: `Frontend work for: ${stub}` },
    { heading: "Stand up the API and wire persistence", body: `Service layer for: ${stub}` },
    { heading: "Model the data this epic needs", body: `Schema and queries for: ${stub}` },
  ];
}

export function buildDecomposition(doc: SourceDoc, keyStart = 201): Decomposition {
  const sections = splitSections(doc.text);
  const units = sections.length >= 2 ? sections : fallbackUnits(doc.text);
  const now = new Date().toISOString();

  const tickets: Ticket[] = units.map((unit, index) => {
    const body = summarize(unit.body, unit.heading);
    return {
      id: `draft_${keyStart + index}`,
      key: `FI-${keyStart + index}`,
      epicId: EPIC.id,
      title: unit.heading,
      body,
      agentType: classify(`${unit.heading} ${unit.body}`, index),
      status: "proposed",
      priority: priorityFor(index, units.length),
      effort: effortFor(unit.body),
      updatedAt: now,
    };
  });

  return {
    title: docTitle(doc.text),
    body: docSummary(doc.text),
    repo: EPIC.repo,
    tickets,
    stats: docStats(doc.text),
  };
}

/** Narration for the delegating phase. Counts come from the finished result, so
 *  the steps describe real work rather than generic spinner copy. */
export function decompositionSteps(result: Decomposition) {
  const { stats, tickets } = result;
  const specialists = new Set(tickets.map((t) => t.agentType)).size;
  // A doc with no bullet lists has zero requirements, and "0 requirements"
  // reads as a failure rather than a fact — so the clause only appears when
  // there is something to count.
  const parsed = stats.sections
    ? `Parsed ${stats.sections} sections${
        stats.requirements ? `, ${stats.requirements} requirements` : ""
      }`
    : `Parsed ${stats.words} words`;

  return [
    { label: parsed, ms: 900 },
    { label: `Drafted ${tickets.length} tickets`, ms: 1100 },
    {
      label: `Routed to ${specialists} ${specialists === 1 ? "specialist" : "specialists"}`,
      ms: 800,
    },
  ];
}

/** A blank ticket for the manual path, where the human is the planner. */
export function blankTicket(index: number, keyStart = 201): Ticket {
  return {
    id: `manual_${keyStart + index}`,
    key: `FI-${keyStart + index}`,
    epicId: EPIC.id,
    title: "",
    body: "",
    agentType: AGENT_TYPES[index % AGENT_TYPES.length],
    status: "proposed",
    priority: "medium",
    effort: "medium",
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Handing the draft to the board
// ---------------------------------------------------------------------------

const DRAFT_KEY = "fi:draft";

export type EpicDraft = {
  title: string;
  body: string;
  repo: string;
  source: string;
  tickets: Ticket[];
};

/** sessionStorage rather than a store so the draft survives the navigation to
 *  `/` and a refresh, without the board needing a provider above it. */
export function stashDraft(draft: EpicDraft) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Private browsing can refuse writes. The navigation still happens; the
    // board just opens without the new tickets rather than trapping the user.
  }
}

/** Reads and clears in one step — a draft is consumed exactly once, so a later
 *  refresh of the board doesn't duplicate the ticket set. */
export function takeDraft(): EpicDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(DRAFT_KEY);
    const parsed = JSON.parse(raw) as EpicDraft;
    if (!parsed || !Array.isArray(parsed.tickets) || parsed.tickets.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
