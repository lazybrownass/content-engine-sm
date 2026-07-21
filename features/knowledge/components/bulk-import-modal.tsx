"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createKnowledgeItemSchema } from "@/features/knowledge/schema";
import { bulkImportKnowledgeItems } from "@/features/knowledge/actions";

const CSV_HEADER_HINT = "category,title,body,tags,pillarHints,sourceUrl";

type PreviewRow = {
  raw: Record<string, unknown>;
  valid: boolean;
  error?: string;
};

type Step = "input" | "preview" | "result";

export function BulkImportModal({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    rejected: { row: number; error: string }[];
  } | null>(null);

  function reset() {
    setStep("input");
    setText("");
    setRows([]);
    setResult(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handlePreview() {
    const parsedRows = parseCsv(text).map((raw) => {
      const parsed = createKnowledgeItemSchema.safeParse(raw);
      return {
        raw,
        valid: parsed.success,
        error: parsed.success
          ? undefined
          : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    });
    setRows(parsedRows);
    setStep("preview");
  }

  async function handleConfirm() {
    setSubmitting(true);
    const response = await bulkImportKnowledgeItems(rows.map((r) => r.raw));
    setSubmitting(false);

    if (!response.success) {
      toast.error(response.error.message);
      return;
    }

    setResult({
      created: response.data.created.length,
      rejected: response.data.rejected,
    });
    setStep("result");
  }

  function handleDone() {
    handleOpenChange(false);
    onSuccess();
  }

  const validCount = rows.filter((r) => r.valid).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Bulk import knowledge items</DialogTitle>
          <DialogDescription>
            {step === "input" &&
              `Paste CSV text with a header row: ${CSV_HEADER_HINT}. Separate multiple tags/pillar hints within a cell with "|".`}
            {step === "preview" && `${validCount} of ${rows.length} rows are valid.`}
            {step === "result" && "Import complete."}
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <Textarea
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={CSV_HEADER_HINT}
            className="font-mono text-xs"
          />
        )}

        {step === "preview" && (
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-muted/50 text-xs">
                <tr>
                  <th className="p-2">Row</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Title</th>
                  <th className="p-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className="border-t">
                    <td className="p-2">{index + 1}</td>
                    <td className="p-2">
                      {row.valid ? (
                        <CheckCircle2 className="size-4 text-primary" />
                      ) : (
                        <XCircle className="size-4 text-destructive" />
                      )}
                    </td>
                    <td className="p-2">{String((row.raw as { title?: string }).title ?? "")}</td>
                    <td className="p-2 text-destructive">{row.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {step === "result" && result && (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              <span className="font-medium text-primary">{result.created}</span> item(s) created.
            </p>
            {result.rejected.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="font-medium text-destructive">
                  {result.rejected.length} row(s) rejected:
                </p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {result.rejected.map((r) => (
                    <li key={r.row}>
                      Row {r.row + 1}: {r.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "input" && (
            <Button onClick={handlePreview} disabled={text.trim().length === 0}>
              Preview
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("input")}>
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={validCount === 0 || submitting}>
                {submitting ? "Importing..." : "Confirm import"}
              </Button>
            </>
          )}
          {step === "result" && <Button onClick={handleDone}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ponytail: naive CSV split — no embedded-newline support, upgrade to papaparse if real CSVs need it
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((key, index) => {
      row[key] = cells[index] ?? "";
    });
    return {
      category: row.category,
      title: row.title,
      body: row.body,
      tags: row.tags
        ? row.tags
            .split("|")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      pillarHints: row.pillarhints
        ? row.pillarhints
            .split("|")
            .map((p) => p.trim())
            .filter(Boolean)
        : [],
      ...(row.sourceurl && { sourceUrl: row.sourceurl }),
    };
  });
}
