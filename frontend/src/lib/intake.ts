// Epic intake: reading an uploaded spec document.
//
// Decomposition itself is NOT here — that is the real PM agent, reached through
// the `orchestrator.proposeDecomposition` Convex action. What's left in this
// file is the offline part: reading the file, understanding its shape, and
// minting blank tickets for the manual path.

import { AGENT_TYPES, type Ticket } from "./orchestrator";

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
// The manual path
// ---------------------------------------------------------------------------

/** A blank ticket for the manual path, where the human is the planner. These
 *  are local drafts only — they get written to Convex through
 *  `orchestrator.addTickets` when the set is finished, and come back with real
 *  ids from there. */
export function blankTicket(index: number, keyStart = 201): Ticket {
  return {
    id: `manual_${keyStart + index}`,
    key: `FI-${keyStart + index}`,
    epicId: "",
    title: "",
    body: "",
    agentType: AGENT_TYPES[index % AGENT_TYPES.length],
    status: "proposed",
    priority: "medium",
    effort: "medium",
    updatedAt: new Date().toISOString(),
    steps: 0,
  };
}
