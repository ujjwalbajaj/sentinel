"use client";

import { ErrorCard } from "@/components/ui/EmptyState";

export default function ConsoleError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorCard message={error.message || "The console could not load this view."} onRetry={reset} />;
}
