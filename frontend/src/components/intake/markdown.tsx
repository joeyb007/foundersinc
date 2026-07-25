// A small Markdown renderer for the intake document preview.
//
// Deliberately hand-rolled rather than a dependency: it covers what a spec
// document actually contains (headings, lists, code, quotes, emphasis, links),
// renders to React elements instead of injected HTML, and its type scale is the
// same one the board uses. Anything it doesn't recognize falls through as text,
// so an unusual document degrades to readable prose rather than breaking.

import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// Ordered by precedence: code first so backticks win over emphasis inside them.
const INLINE_PATTERN =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(\[[^\]\n]*\]\([^)\s]+\))/g;

/** Only schemes that can't execute. A spec document is untrusted input — a
 *  `javascript:` href in one would run on click. */
function safeHref(href: string) {
  return /^(https?:|mailto:)/i.test(href) ? href : undefined;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  INLINE_PATTERN.lastIndex = 0;
  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("[")) {
      const link = /^\[([^\]]*)\]\(([^)\s]+)\)$/.exec(token);
      const href = link ? safeHref(link[2]) : undefined;
      const label = link ? link[1] || link[2] : token;
      nodes.push(
        href ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            {label}
          </a>
        ) : (
          <Fragment key={key}>{label}</Fragment>
        )
      );
    } else {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "code"; text: string; lang: string }
  | { kind: "quote"; text: string }
  | { kind: "rule" };

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code runs to its closing fence, or to the end of the document if
    // the author never closed it.
    const fence = /^```\s*(\S*)\s*$/.exec(line);
    if (fence) {
      flushParagraph();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      blocks.push({ kind: "code", text: body.join("\n"), lang: fence[1] });
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    if (/^(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushParagraph();
      blocks.push({ kind: "rule" });
      continue;
    }

    const heading = /^(#{1,3})\s+(.*\S)\s*$/.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2],
      });
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      const body = [quote[1]];
      while (i + 1 < lines.length && /^>\s?/.test(lines[i + 1])) {
        body.push(lines[i + 1].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", text: body.join(" ").trim() });
      continue;
    }

    const bullet = /^\s*(?:[-*+]|(\d+)\.)\s+(.*\S)\s*$/.exec(line);
    if (bullet) {
      flushParagraph();
      const ordered = bullet[1] !== undefined;
      const items = [bullet[2]];
      while (i + 1 < lines.length) {
        const next = /^\s*(?:[-*+]|(\d+)\.)\s+(.*\S)\s*$/.exec(lines[i + 1]);
        if (!next || (next[1] !== undefined) !== ordered) break;
        items.push(next[2]);
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  return blocks;
}

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: "mt-8 text-2xl font-semibold tracking-tight first:mt-0",
  2: "mt-7 border-b pb-1.5 text-lg font-semibold tracking-tight first:mt-0",
  3: "mt-6 text-sm font-semibold tracking-tight first:mt-0",
};

export function Markdown({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const blocks = parseBlocks(source);

  return (
    <div className={cn("text-sm leading-relaxed text-muted-foreground", className)}>
      {blocks.map((block, index) => {
        const key = `block-${index}`;

        switch (block.kind) {
          case "heading": {
            const Tag = (["h1", "h2", "h3"] as const)[block.level - 1];
            return (
              <Tag key={key} className={cn(HEADING_CLASS[block.level], "text-foreground")}>
                {renderInline(block.text, key)}
              </Tag>
            );
          }
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag
                key={key}
                className={cn(
                  "mt-3 space-y-1.5 pl-5",
                  block.ordered ? "list-decimal" : "list-disc",
                  "marker:text-muted-foreground/50"
                )}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`} className="pl-1">
                    {renderInline(item, `${key}-${itemIndex}`)}
                  </li>
                ))}
              </Tag>
            );
          }
          case "code":
            return (
              <pre
                key={key}
                className="mt-4 overflow-x-auto rounded-lg border bg-muted/40 p-3"
              >
                <code className="font-mono text-xs text-foreground">{block.text}</code>
              </pre>
            );
          case "quote":
            return (
              <blockquote
                key={key}
                className="mt-4 border-l-2 border-border pl-3 text-muted-foreground italic"
              >
                {renderInline(block.text, key)}
              </blockquote>
            );
          case "rule":
            return <hr key={key} className="mt-6 border-border" />;
          default:
            return (
              <p key={key} className="mt-3 first:mt-0">
                {renderInline(block.text, key)}
              </p>
            );
        }
      })}
    </div>
  );
}
