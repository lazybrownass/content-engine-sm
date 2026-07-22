import { generateObject, NoObjectGeneratedError } from "ai";
import type { z } from "zod";

import { getModel, type ModelPurpose } from "@/lib/ai/model-router";
import type { PipelineStage } from "@prisma/client";

// AGENTS.md Rule 8.2: every LLM-backed stage's output is validated against a Zod
// schema immediately on return. On validation failure: one automatic retry with
// an added "return valid JSON only" instruction, then fail the stage explicitly —
// never silently pass through malformed data.
export class PipelineStageError extends Error {
  constructor(
    public readonly stage: PipelineStage,
    cause: unknown,
  ) {
    super(`Pipeline stage ${stage} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "PipelineStageError";
  }
}

export interface GenerateStageObjectInput<T> {
  stage: PipelineStage;
  purpose: ModelPurpose;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
}

export interface GenerateStageObjectOutput<T> {
  output: T;
  modelId: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  retried: boolean;
  firstAttemptError?: string;
}

async function callModel<T>({
  purpose,
  schema,
  system,
  prompt,
}: {
  purpose: ModelPurpose;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
}) {
  const model = getModel(purpose);
  const modelId = typeof model === "string" ? model : model.modelId;
  const start = Date.now();
  const result = await generateObject({
    model,
    schema,
    system,
    prompt,
  });
  return {
    output: result.object,
    modelId,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    latencyMs: Date.now() - start,
  };
}

export async function generateStageObject<T>({
  stage,
  purpose,
  schema,
  system,
  prompt,
}: GenerateStageObjectInput<T>): Promise<GenerateStageObjectOutput<T>> {
  try {
    const result = await callModel({ purpose, schema, system, prompt });
    return { ...result, retried: false };
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error)) {
      throw new PipelineStageError(stage, error);
    }

    const firstAttemptError = error.message;

    try {
      const retrySystem = `${system}\n\nReturn valid JSON only, matching this exact shape. No markdown fences, no commentary, no extra keys.`;
      const result = await callModel({ purpose, schema, system: retrySystem, prompt });
      return { ...result, retried: true, firstAttemptError };
    } catch (retryError) {
      throw new PipelineStageError(stage, retryError);
    }
  }
}
