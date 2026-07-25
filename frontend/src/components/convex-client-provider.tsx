"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";

// Created once at module scope, not per render — the client owns the websocket
// that every `useQuery` subscription rides on.
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

/** Without a deployment there is no data at all, so say so plainly instead of
 *  letting every `useQuery` throw "Could not find Convex client". */
function MissingDeployment() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-lg font-semibold">Convex isn&apos;t configured</h1>
      <p className="text-sm text-muted-foreground">
        The board reads everything from Convex, and{" "}
        <code className="font-mono text-xs">NEXT_PUBLIC_CONVEX_URL</code> is not
        set. Provision a dev deployment and restart the dev server:
      </p>
      <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
        cd frontend && npx convex dev
      </pre>
      <p className="text-sm text-muted-foreground">
        That writes the URL into{" "}
        <code className="font-mono text-xs">.env.local</code> for you.
      </p>
    </main>
  );
}

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  if (!convex) return <MissingDeployment />;
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
