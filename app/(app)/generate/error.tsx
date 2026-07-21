"use client";

import { Button } from "@/components/ui/button";

export default function GenerateError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <p className="text-sm font-medium text-destructive">Something went wrong loading Generate.</p>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button variant="outline" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
