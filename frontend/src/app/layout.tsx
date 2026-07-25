import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// globals.css maps --font-sans / --font-geist-mono in its @theme block,
// so the variable names here have to match those exactly.
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Both routes set their own title; this is the fallback.
export const metadata: Metadata = {
  title: "Cycles",
  description:
    "Submit an epic, approve the ticket set, and watch specialized agents ship it in parallel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ConvexClientProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
