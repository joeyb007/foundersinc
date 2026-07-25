import type { Metadata } from "next";

import { IntakeView } from "@/components/intake/intake-view";

export const metadata: Metadata = {
  title: "New epic — Founders Inc",
  description:
    "Upload an epic document or project spec, then hand it to the PM agent or break it down yourself.",
};

export default function Home() {
  return <IntakeView />;
}
