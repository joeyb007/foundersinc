import type { Metadata } from "next";

import { EpicBoard } from "@/components/board/epic-board";

export const metadata: Metadata = {
  title: "Epic board — Cycles",
  description:
    "Approve the proposed ticket set and watch specialized agents ship it in parallel.",
};

// The epic is a URL parameter rather than client state, so a board is
// linkable and survives a refresh. Reading it here instead of with
// `useSearchParams` keeps the client tree out of a Suspense boundary.
export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { epicId } = await searchParams;
  return <EpicBoard epicId={typeof epicId === "string" ? epicId : undefined} />;
}
