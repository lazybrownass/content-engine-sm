"use client";

import { useState, type FormEvent } from "react";
import { Pillar, type Topic } from "@prisma/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatEnumLabel } from "@/lib/utils";
import { updateTopic } from "@/features/topics/actions";
import { updateTopicSchema } from "@/features/topics/schema";

type FormValues = { title: string; rationale: string; pillar: string };

function toFormValues(topic: Topic): FormValues {
  return { title: topic.title, rationale: topic.rationale, pillar: topic.pillar };
}

export function TopicEditSheet({
  topic,
  onOpenChange,
  onSuccess,
}: {
  topic: Topic | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [values, setValues] = useState<FormValues>(() => (topic ? toFormValues(topic) : { title: "", rationale: "", pillar: "" }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [lastTopicId, setLastTopicId] = useState<string | null>(null);

  if (topic && topic.id !== lastTopicId) {
    setLastTopicId(topic.id);
    setValues(toFormValues(topic));
    setErrors({});
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!topic) return;

    const parsed = updateTopicSchema.safeParse({
      id: topic.id,
      title: values.title,
      rationale: values.rationale,
      pillar: values.pillar,
    });

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
    const result = await updateTopic(parsed.data);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error.message);
      return;
    }

    toast.success("Topic updated");
    onSuccess();
  }

  return (
    <Sheet open={topic !== null} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit topic</SheetTitle>
        </SheetHeader>

        <form
          id="topic-edit-form"
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
        >
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={values.title}
              onChange={(e) => setValues((prev) => ({ ...prev, title: e.target.value }))}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Rationale</label>
            <Textarea
              rows={4}
              value={values.rationale}
              onChange={(e) => setValues((prev) => ({ ...prev, rationale: e.target.value }))}
            />
            {errors.rationale && <p className="text-xs text-destructive">{errors.rationale}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Pillar</label>
            <select
              value={values.pillar}
              onChange={(e) => setValues((prev) => ({ ...prev, pillar: e.target.value }))}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {Object.values(Pillar).map((value) => (
                <option key={value} value={value}>
                  {formatEnumLabel(value)}
                </option>
              ))}
            </select>
            {errors.pillar && <p className="text-xs text-destructive">{errors.pillar}</p>}
          </div>
        </form>

        <SheetFooter>
          <Button type="submit" form="topic-edit-form" disabled={submitting}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
