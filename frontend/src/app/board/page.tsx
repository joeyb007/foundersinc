import type { Metadata } from "next";

import { EpicBoard } from "@/components/board/epic-board";

export const metadata: Metadata = {
  title: "Epic board — Founders Inc",
  description:
    "Approve the proposed ticket set and watch specialized agents ship it in parallel.",
};

export default function BoardPage() {
  return <EpicBoard />;
}
