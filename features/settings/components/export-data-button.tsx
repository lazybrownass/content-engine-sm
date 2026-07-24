"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { exportAccountData } from "@/features/settings/actions";

export function ExportDataButton() {
  const [pending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      const result = await exportAccountData();
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }

      const blob = new Blob([result.data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `content-engine-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    });
  }

  return (
    <Button type="button" onClick={handleExport} disabled={pending}>
      {pending ? "Exporting..." : "Export all data (JSON)"}
    </Button>
  );
}
