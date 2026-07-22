import { createHuggingFace } from "@ai-sdk/huggingface";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import { createMockGenerationModel } from "./mock-generation-model";

// AGENTS.md Rule 4: the single AI model-SDK boundary. Feature code never
// imports a provider SDK directly — it calls getModel(purpose) instead.
// Phase 2's per-stage/prompt_templates routing will extend this map further
// rather than replacing it; today every purpose still resolves to the same
// GENERATION_MODEL env var, except inline_edit (see below).

const huggingface = createHuggingFace({ apiKey: process.env.HUGGINGFACE_API_TOKEN });

export type ModelPurpose =
  | "brand-voice-generation"
  | "outline"
  | "draft"
  | "grill_review"
  | "topic_generation"
  | "inline_edit";

const MODEL_IDS: Record<ModelPurpose, string> = {
  "brand-voice-generation": process.env.GENERATION_MODEL ?? "Qwen/Qwen2.5-72B-Instruct",
  outline: process.env.GENERATION_MODEL ?? "Qwen/Qwen2.5-72B-Instruct",
  draft: process.env.GENERATION_MODEL ?? "Qwen/Qwen2.5-72B-Instruct",
  grill_review: process.env.GENERATION_MODEL ?? "Qwen/Qwen2.5-72B-Instruct",
  topic_generation: process.env.GENERATION_MODEL ?? "Qwen/Qwen2.5-72B-Instruct",
  // Inline editor actions (rewrite/shorten/change-hook) route to a smaller, faster
  // model than the Writing-stage tier per docs/06-Implementation-Plan.md's Phase 3
  // risk note — these are short, latency-sensitive calls made while the owner waits.
  inline_edit: process.env.INLINE_EDIT_MODEL ?? "Qwen/Qwen2.5-7B-Instruct",
};

export function getModel(purpose: ModelPurpose): LanguageModel {
  // E2E_MOCK_LLM keeps Playwright's production-build run hermetic and fast — a real
  // HF call would be slow/flaky/costly, and ai/AGENTS.md 9.3 forbids asserting on real
  // model output in CI anyway.
  if (process.env.E2E_MOCK_LLM) {
    return createMockGenerationModel();
  }

  // Opt-in local Ollama provider (Phase 2 (continued) — Local Model Execution addendum).
  // Decided synchronously via MODEL_PROVIDER at call time, never an automatic runtime
  // health-check/retry — that's the separate, still-unbuilt §5.6 fallback-provider work.
  // A single model serves all six purposes here (no per-purpose Ollama routing). Read
  // fresh per call (not hoisted to a module-level const) so the switch stays testable.
  if (process.env.MODEL_PROVIDER === "ollama") {
    const baseURL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
    const modelId = process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct-q4_K_M";
    const ollama = createOpenAICompatible({ baseURL, name: "ollama" });
    return ollama(modelId);
  }

  return huggingface(MODEL_IDS[purpose]);
}
