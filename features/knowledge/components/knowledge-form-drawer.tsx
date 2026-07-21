"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { KnowledgeCategory, Pillar, type KnowledgeItem } from "@prisma/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn, formatEnumLabel } from "@/lib/utils";
import {
  archiveKnowledgeItem,
  createKnowledgeItem,
  updateKnowledgeItem,
} from "@/features/knowledge/actions";
import {
  createKnowledgeItemSchema,
  updateKnowledgeItemSchema,
} from "@/features/knowledge/schema";

type FormValues = {
  category: string;
  title: string;
  body: string;
  tags: string;
  pillarHints: string[];
  sourceUrl: string;
};

const emptyForm: FormValues = {
  category: "",
  title: "",
  body: "",
  tags: "",
  pillarHints: [],
  sourceUrl: "",
};

function toFormValues(item?: KnowledgeItem): FormValues {
  if (!item) return emptyForm;
  return {
    category: item.category,
    title: item.title,
    body: item.body,
    tags: item.tags.join(", "),
    pillarHints: item.pillarHints,
    sourceUrl: item.sourceUrl ?? "",
  };
}

export function KnowledgeFormDrawer({
  open,
  onOpenChange,
  item,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: KnowledgeItem;
  onSuccess: () => void;
}) {
  const [values, setValues] = useState<FormValues>(() => toFormValues(item));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValues(toFormValues(item));
      setErrors({});
    }
  }

  function togglePillar(pillar: string) {
    setValues((prev) => ({
      ...prev,
      pillarHints: prev.pillarHints.includes(pillar)
        ? prev.pillarHints.filter((p) => p !== pillar)
        : [...prev.pillarHints, pillar],
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const payload = {
      category: values.category,
      title: values.title,
      body: values.body,
      tags: values.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      pillarHints: values.pillarHints,
      ...(values.sourceUrl && { sourceUrl: values.sourceUrl }),
    };

    const parsed = item
      ? updateKnowledgeItemSchema.safeParse({ id: item.id, ...payload })
      : createKnowledgeItemSchema.safeParse(payload);

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]?.toString() ?? "form";
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    const result = item
      ? await updateKnowledgeItem(parsed.data)
      : await createKnowledgeItem(parsed.data);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error.message);
      return;
    }

    toast.success(item ? "Knowledge item updated" : "Knowledge item created");
    onSuccess();
  }

  async function handleArchive() {
    if (!item) return;
    const result = await archiveKnowledgeItem(item.id);
    setConfirmArchive(false);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    toast.success("Knowledge item archived");
    onSuccess();
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex flex-col overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{item ? "Edit knowledge item" : "New knowledge item"}</SheetTitle>
          </SheetHeader>

          <form
            id="knowledge-form"
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
          >
            <Field label="Category" error={errors.category}>
              <select
                value={values.category}
                onChange={(e) => setValues((prev) => ({ ...prev, category: e.target.value }))}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="" disabled>
                  Select a category
                </option>
                {Object.values(KnowledgeCategory).map((value) => (
                  <option key={value} value={value}>
                    {formatEnumLabel(value)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Title" error={errors.title}>
              <Input
                value={values.title}
                onChange={(e) => setValues((prev) => ({ ...prev, title: e.target.value }))}
              />
            </Field>

            <Field label="Body" error={errors.body}>
              <Textarea
                rows={6}
                value={values.body}
                onChange={(e) => setValues((prev) => ({ ...prev, body: e.target.value }))}
              />
            </Field>

            <Field label="Tags" error={errors.tags} hint="Comma-separated">
              <Input
                value={values.tags}
                onChange={(e) => setValues((prev) => ({ ...prev, tags: e.target.value }))}
              />
            </Field>

            <Field label="Pillar hints" error={errors.pillarHints}>
              <div className="flex flex-wrap gap-1.5">
                {Object.values(Pillar).map((pillar) => (
                  <button
                    key={pillar}
                    type="button"
                    aria-pressed={values.pillarHints.includes(pillar)}
                    onClick={() => togglePillar(pillar)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      values.pillarHints.includes(pillar)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-transparent hover:bg-muted",
                    )}
                  >
                    {formatEnumLabel(pillar)}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Source URL" error={errors.sourceUrl} hint="Optional">
              <Input
                value={values.sourceUrl}
                onChange={(e) => setValues((prev) => ({ ...prev, sourceUrl: e.target.value }))}
                placeholder="https://..."
              />
            </Field>
          </form>

          <SheetFooter className="flex-row justify-between">
            {item ? (
              <Button type="button" variant="destructive" onClick={() => setConfirmArchive(true)}>
                Archive
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" form="knowledge-form" disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive this knowledge item?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            It will be hidden from search and lists but not deleted.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmArchive(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleArchive}>
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
