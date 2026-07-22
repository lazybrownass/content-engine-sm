"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { BrandVoice } from "@prisma/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createBrandVoice, updateBrandVoice } from "@/features/brand-voice/actions";
import { createBrandVoiceSchema, updateBrandVoiceSchema } from "@/features/brand-voice/schema";

type FormValues = {
  name: string;
  tone: string;
  targetAudience: string;
  forbiddenWords: string;
  signatureHooks: string;
  formattingRules: string;
  isDefault: boolean;
};

const emptyForm: FormValues = {
  name: "",
  tone: "",
  targetAudience: "",
  forbiddenWords: "",
  signatureHooks: "",
  formattingRules: "",
  isDefault: false,
};

function toFormValues(voice?: BrandVoice): FormValues {
  if (!voice) return emptyForm;
  return {
    name: voice.name,
    tone: voice.tone.join(", "),
    targetAudience: voice.targetAudience ?? "",
    forbiddenWords: voice.forbiddenWords.join(", "),
    signatureHooks: voice.signatureHooks.join(", "),
    formattingRules: voice.formattingRules.join(", "),
    isDefault: voice.isDefault,
  };
}

function toList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function BrandVoiceFormDrawer({
  open,
  onOpenChange,
  voice,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voice?: BrandVoice;
  onSuccess: () => void;
}) {
  const [values, setValues] = useState<FormValues>(() => toFormValues(voice));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValues(toFormValues(voice));
      setErrors({});
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const payload = {
      name: values.name,
      tone: toList(values.tone),
      forbiddenWords: toList(values.forbiddenWords),
      signatureHooks: toList(values.signatureHooks),
      formattingRules: toList(values.formattingRules),
      isDefault: values.isDefault,
      ...(values.targetAudience && { targetAudience: values.targetAudience }),
    };

    const parsed = voice
      ? updateBrandVoiceSchema.safeParse({ id: voice.id, ...payload })
      : createBrandVoiceSchema.safeParse(payload);

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
    const result = voice
      ? await updateBrandVoice(parsed.data)
      : await createBrandVoice(parsed.data);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error.message);
      return;
    }

    toast.success(voice ? "Brand voice updated" : "Brand voice created");
    onSuccess();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{voice ? "Edit brand voice" : "New brand voice"}</SheetTitle>
        </SheetHeader>

        <form
          id="brand-voice-form"
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
        >
          <Field label="Name" error={errors.name}>
            <Input
              value={values.name}
              onChange={(e) => setValues((prev) => ({ ...prev, name: e.target.value }))}
            />
          </Field>

          <Field label="Tone" error={errors.tone} hint="Comma-separated, e.g. direct, optimistic">
            <Input
              value={values.tone}
              onChange={(e) => setValues((prev) => ({ ...prev, tone: e.target.value }))}
            />
          </Field>

          <Field label="Target audience" error={errors.targetAudience} hint="Optional">
            <Input
              value={values.targetAudience}
              onChange={(e) => setValues((prev) => ({ ...prev, targetAudience: e.target.value }))}
            />
          </Field>

          <Field label="Forbidden words" error={errors.forbiddenWords} hint="Comma-separated">
            <Input
              value={values.forbiddenWords}
              onChange={(e) => setValues((prev) => ({ ...prev, forbiddenWords: e.target.value }))}
            />
          </Field>

          <Field label="Signature hooks" error={errors.signatureHooks} hint="Comma-separated">
            <Input
              value={values.signatureHooks}
              onChange={(e) => setValues((prev) => ({ ...prev, signatureHooks: e.target.value }))}
            />
          </Field>

          <Field label="Formatting rules" error={errors.formattingRules} hint="Comma-separated">
            <Input
              value={values.formattingRules}
              onChange={(e) => setValues((prev) => ({ ...prev, formattingRules: e.target.value }))}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={values.isDefault}
              onChange={(e) => setValues((prev) => ({ ...prev, isDefault: e.target.checked }))}
              className="size-4 rounded border-input"
            />
            Set as default
          </label>
        </form>

        <SheetFooter>
          <Button type="submit" form="brand-voice-form" disabled={submitting}>
            {submitting ? "Saving..." : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
