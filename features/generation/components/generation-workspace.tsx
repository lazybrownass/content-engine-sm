"use client";

import { useState } from "react";
import type { BrandVoice } from "@prisma/client";
import { experimental_useObject as useObject } from "@ai-sdk/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { BrandVoiceManager } from "@/features/brand-voice/components/brand-voice-manager";
import { generationOutputSchema } from "@/features/generation/schema";

import { CopyButton } from "./copy-button";
import { RagContextDrawer } from "./rag-context-drawer";

type Tab = "linkedin" | "thread" | "hook";
const TABS: { id: Tab; label: string }[] = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "thread", label: "X Thread" },
  { id: "hook", label: "Hook" },
];

export function GenerationWorkspace({ brandVoices }: { brandVoices: BrandVoice[] }) {
  const defaultVoiceId = brandVoices.find((voice) => voice.isDefault)?.id ?? "";
  const [prompt, setPrompt] = useState("");
  const [brandVoiceId, setBrandVoiceId] = useState(defaultVoiceId);
  const [touchedBrandVoice, setTouchedBrandVoice] = useState(false);
  const [tab, setTab] = useState<Tab>("linkedin");

  // Adjust state during render (not an effect) when the default voice changes
  // underneath us (e.g. after router.refresh() from the brand voice manager) —
  // but only if the user hasn't manually picked a different voice themselves.
  const [prevDefaultVoiceId, setPrevDefaultVoiceId] = useState(defaultVoiceId);
  if (defaultVoiceId !== prevDefaultVoiceId) {
    setPrevDefaultVoiceId(defaultVoiceId);
    if (!touchedBrandVoice) setBrandVoiceId(defaultVoiceId);
  }

  const { object, submit, isLoading, stop, error } = useObject({
    api: "/api/generate",
    schema: generationOutputSchema,
  });

  function handleSubmit() {
    submit({ prompt, brandVoiceId: brandVoiceId || undefined });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="brand-voice" className="text-sm font-medium">
            Brand voice
          </label>
          <select
            id="brand-voice"
            value={brandVoiceId}
            onChange={(e) => {
              setBrandVoiceId(e.target.value);
              setTouchedBrandVoice(true);
            }}
            className="h-8 w-56 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">No brand voice</option>
            {brandVoices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name}
                {voice.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
        </div>
        <BrandVoiceManager voices={brandVoices} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="prompt" className="text-sm font-medium">
          Topic
        </label>
        <Textarea
          id="prompt"
          rows={4}
          placeholder="Describe what you want to post about..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={handleSubmit} disabled={isLoading || !prompt.trim()}>
          {isLoading ? "Generating..." : "Generate"}
        </Button>
        {isLoading && (
          <Button type="button" variant="outline" onClick={stop}>
            Stop
          </Button>
        )}
        <RagContextDrawer prompt={prompt} />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert" aria-live="assertive">
          {error.message}
        </p>
      ) : null}

      {object ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-1.5" role="tablist">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  tab === id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-transparent hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "linkedin" && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>LinkedIn post</CardTitle>
                {object.linkedInPost ? (
                  <CopyButton text={object.linkedInPost} label="LinkedIn post" />
                ) : null}
              </CardHeader>
              <CardContent className="whitespace-pre-wrap">
                {object.linkedInPost ?? "Generating..."}
              </CardContent>
            </Card>
          )}

          {tab === "thread" && (
            <div className="flex flex-col gap-3">
              {object.tweetThread && object.tweetThread.length > 0 ? (
                object.tweetThread.map((tweet, index) => (
                  <Card key={index}>
                    <CardHeader className="flex-row items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        Tweet {index + 1}
                        <span
                          className={cn(
                            "text-xs font-normal",
                            (tweet?.length ?? 0) > 280
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {tweet?.length ?? 0}/280
                        </span>
                      </CardTitle>
                      {tweet ? <CopyButton text={tweet} label={`tweet ${index + 1}`} /> : null}
                    </CardHeader>
                    <CardContent className="whitespace-pre-wrap">{tweet}</CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent>Generating...</CardContent>
                </Card>
              )}
            </div>
          )}

          {tab === "hook" && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  Hook
                  {object.hook ? (
                    <span
                      className={cn(
                        "text-xs font-normal",
                        object.hook.length > 120 ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {object.hook.length}/120
                    </span>
                  ) : null}
                </CardTitle>
                {object.hook ? <CopyButton text={object.hook} label="hook" /> : null}
              </CardHeader>
              <CardContent className="whitespace-pre-wrap">
                {object.hook ?? "Generating..."}
              </CardContent>
            </Card>
          )}
        </div>
      ) : !isLoading ? (
        <p className="text-sm text-muted-foreground">
          Describe what you want to post about, then generate to see LinkedIn, X thread, and hook
          drafts here.
        </p>
      ) : null}
    </div>
  );
}
